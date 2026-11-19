import { PHP } from '@php-wasm/universal';
import { loadWebRuntime } from '@php-wasm/web';
import { LARAVEL_FS_FILES } from './vfsFiles';

export interface SqlLogEntry {
  query: string;
  bindings: (string | number | boolean | null)[];
  time_ms: number;
}

export interface TelemetryTrace {
  id: string;
  timestamp: string;
  method: string;
  uri: string;
  status: number;
  controller: string;
  action: string;
  controller_file: string;
  method_source: string;
  file_source: string;
  queries: SqlLogEntry[];
  duration_ms: number;
  memory_kb: number;
  php_version: string;
  sqlite_version: string;
  response_preview: unknown;
}

export interface LaravelResponse<T = any> {
  status: number;
  data: T;
  telemetry: TelemetryTrace;
}

export interface TableDump {
  name: string;
  sql: string;
  count: number;
  columns: string[];
  rows: Record<string, any>[];
}

const IDB_NAME = 'frank_valdez_laravel_wasm_db_v2';
const IDB_STORE = 'vfs_store';
const IDB_SQLITE_KEY = 'database_sqlite_bytes';
const IDB_CONTROLLERS_KEY = 'hot_edited_controllers';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, val: unknown): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(val, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore IndexedDB errors in private browsing
  }
}

class LaravelWasmKernel {
  private php: PHP | null = null;
  private bootPromise: Promise<void> | null = null;
  private executionQueue: Promise<any> = Promise.resolve();
  private phpVersion = '8.3';
  private sqliteVersion = '3.45';
  private traceListeners: ((trace: TelemetryTrace) => void)[] = [];

  public onTrace(cb: (trace: TelemetryTrace) => void): () => void {
    this.traceListeners.push(cb);
    return () => {
      this.traceListeners = this.traceListeners.filter((x) => x !== cb);
    };
  }

  private emitTrace(trace: TelemetryTrace) {
    for (const cb of this.traceListeners) {
      cb(trace);
    }
  }

  public async boot(): Promise<{ phpVersion: string; sqliteVersion: string }> {
    if (!this.bootPromise) {
      this.bootPromise = this.initRuntime();
    }
    await this.bootPromise;
    return { phpVersion: this.phpVersion, sqliteVersion: this.sqliteVersion };
  }

  private ensureDirs(php: PHP) {
    const dirs = [
      '/app',
      '/app/bootstrap',
      '/app/Models',
      '/app/Http',
      '/app/Http/Controllers',
      '/app/routes',
      '/app/database',
      '/app/database/migrations',
      '/app/database/seeders',
      '/tmp',
    ];
    for (const d of dirs) {
      try {
        if (!php.fileExists(d)) {
          php.mkdir(d);
        }
      } catch {
        // already exists
      }
    }
  }

  private async initRuntime(): Promise<void> {
    const runtimeId = await loadWebRuntime('8.3');
    const php = new PHP(runtimeId);
    this.php = php;
    this.ensureDirs(php);

    // Mount all Laravel virtual filesystem files
    for (const [path, contents] of Object.entries(LARAVEL_FS_FILES)) {
      php.writeFile(path, contents);
    }

    // Restore hot-edited controllers if user previously customized them
    const savedControllers = await idbGet<Record<string, string>>(IDB_CONTROLLERS_KEY);
    if (savedControllers) {
      for (const [path, contents] of Object.entries(savedControllers)) {
        if (php.fileExists(path)) {
          php.writeFile(path, contents);
        }
      }
    }

    // Restore persisted SQLite database bytes if present
    const savedSqlite = await idbGet<Uint8Array>(IDB_SQLITE_KEY);
    if (savedSqlite && savedSqlite.byteLength > 0) {
      php.writeFile('/app/database/database.sqlite', savedSqlite);
    }

    // Run initial boot & migration check
    const info = await this.runPhpScript(`<?php
require_once '/app/bootstrap/boot.php';
$pdo = \\Illuminate\\Support\\Facades\\DB::connection();
echo json_encode([
  'php_version' => PHP_VERSION,
  'sqlite_version' => $pdo->query('select sqlite_version()')->fetchColumn(),
]);
`);
    try {
      const parsed = JSON.parse(info);
      this.phpVersion = parsed.php_version || '8.3';
      this.sqliteVersion = parsed.sqlite_version || '3.45';
    } catch {
      // keep defaults
    }
    await this.persistSqliteToIndexedDB();
  }

  private async runPhpScript(code: string): Promise<string> {
    const run = async () => {
      if (!this.php) {
        throw new Error('PHP WebAssembly runtime not initialized');
      }
      const scriptPath = '/tmp/__exec.php';
      this.php.writeFile(scriptPath, code);
      const streamed = await this.php.runStream({ scriptPath });
      const stdout = await streamed.stdoutText;
      const stderr = await streamed.stderrText;
      if (!stdout && stderr) {
        throw new Error(stderr);
      }
      return stdout;
    };

    const next = this.executionQueue.then(run, run);
    this.executionQueue = next.catch(() => {});
    return next;
  }

  public async persistSqliteToIndexedDB(): Promise<void> {
    if (!this.php) return;
    try {
      if (this.php.fileExists('/app/database/database.sqlite')) {
        const bytes = this.php.readFileAsBuffer('/app/database/database.sqlite');
        await idbSet(IDB_SQLITE_KEY, new Uint8Array(bytes));
      }
    } catch {
      // ignore
    }
  }

  public async dispatch<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    uri: string,
    body: Record<string, any> = {}
  ): Promise<LaravelResponse<T>> {
    await this.boot();

    const payloadJson = JSON.stringify({ method, uri, body });
    const payloadB64 = btoa(unescape(encodeURIComponent(payloadJson)));

    const dispatchScript = `<?php
error_reporting(E_ALL);
ini_set('display_errors', '0');
$startTime = microtime(true);

try {
    require_once '/app/bootstrap/boot.php';
    \\Illuminate\\Support\\Facades\\DB::enableQueryLog();

    $input = json_decode(base64_decode('${payloadB64}'), true);
    $method = $input['method'] ?? 'GET';
    $uri = $input['uri'] ?? '/api/projects';
    $body = $input['body'] ?? [];

    $parsedUrl = parse_url($uri);
    $path = $parsedUrl['path'] ?? '/';
    $query = [];
    if (!empty($parsedUrl['query'])) {
        parse_str($parsedUrl['query'], $query);
    }

    $matched = \\Illuminate\\Support\\Facades\\Route::match($method, $path);
    if (!$matched) {
        echo json_encode([
            'status' => 404,
            'data' => ['message' => "Route [{$method} {$path}] not defined in routes/api.php."],
            'telemetry' => [
                'controller' => 'RouteFallback',
                'action' => 'notFound',
                'controller_file' => '/app/routes/api.php',
                'method_source' => file_get_contents('/app/routes/api.php'),
                'file_source' => file_get_contents('/app/routes/api.php'),
                'queries' => [],
                'duration_ms' => round((microtime(true) - $startTime) * 1000, 2),
                'memory_kb' => round(memory_get_usage(true) / 1024, 1),
                'php_version' => PHP_VERSION,
                'sqlite_version' => \\Illuminate\\Support\\Facades\\DB::connection()->query('select sqlite_version()')->fetchColumn(),
            ]
        ]);
        exit;
    }

    $controllerClass = $matched['controller'];
    $actionMethod = $matched['action'];
    $routeParams = $matched['params'] ?? [];

    $request = new \\Illuminate\\Http\\Request($method, $path, $query, $body, $routeParams);
    $controllerInstance = new $controllerClass();
    $rawResult = $controllerInstance->$actionMethod($request);

    $status = $rawResult['__status'] ?? 200;
    $data = $rawResult['__data'] ?? $rawResult;

    // Use PHP ReflectionMethod to extract exact controller source lines for X-Ray Mode!
    $refl = new \\ReflectionMethod($controllerClass, $actionMethod);
    $fileName = $refl->getFileName();
    $startLine = max(1, $refl->getStartLine() - 4);
    $endLine = $refl->getEndLine();
    $fullFileSource = file_exists($fileName) ? file_get_contents($fileName) : '';
    $lines = explode("\\n", $fullFileSource);
    $methodSlice = array_slice($lines, $startLine - 1, $endLine - $startLine + 1);
    $numberedMethod = [];
    foreach ($methodSlice as $idx => $lineText) {
        $lineNum = $startLine + $idx;
        $numberedMethod[] = str_pad((string)$lineNum, 3, ' ', STR_PAD_LEFT) . ' | ' . $lineText;
    }

    echo json_encode([
        'status' => $status,
        'data' => $data,
        'telemetry' => [
            'controller' => class_basename($controllerClass),
            'action' => $actionMethod,
            'controller_file' => $fileName,
            'method_source' => implode("\\n", $numberedMethod),
            'file_source' => $fullFileSource,
            'queries' => \\Illuminate\\Support\\Facades\\DB::getQueryLog(),
            'duration_ms' => round((microtime(true) - $startTime) * 1000, 2),
            'memory_kb' => round(memory_get_usage(true) / 1024, 1),
            'php_version' => PHP_VERSION,
            'sqlite_version' => \\Illuminate\\Support\\Facades\\DB::connection()->query('select sqlite_version()')->fetchColumn(),
        ]
    ]);
} catch (\\Throwable $e) {
    $code = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    echo json_encode([
        'status' => $code,
        'data' => [
            'message' => $e->getMessage(),
            'exception' => get_class($e),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ],
        'telemetry' => [
            'controller' => 'ExceptionHandler',
            'action' => 'render',
            'controller_file' => $e->getFile(),
            'method_source' => "Line {$e->getLine()}: " . $e->getMessage(),
            'file_source' => file_exists($e->getFile()) ? file_get_contents($e->getFile()) : '',
            'queries' => \\Illuminate\\Support\\Facades\\DB::getQueryLog(),
            'duration_ms' => round((microtime(true) - $startTime) * 1000, 2),
            'memory_kb' => round(memory_get_usage(true) / 1024, 1),
            'php_version' => PHP_VERSION,
            'sqlite_version' => '3.45',
        ]
    ]);
}
`;

    const rawOut = await this.runPhpScript(dispatchScript);
    if (method !== 'GET') {
      await this.persistSqliteToIndexedDB();
    }

    const parsed = JSON.parse(rawOut);
    const trace: TelemetryTrace = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      method,
      uri,
      status: parsed.status ?? 200,
      controller: parsed.telemetry?.controller ?? 'Controller',
      action: parsed.telemetry?.action ?? 'index',
      controller_file: parsed.telemetry?.controller_file ?? '/app/Http/Controllers/ProjectController.php',
      method_source: parsed.telemetry?.method_source ?? '',
      file_source: parsed.telemetry?.file_source ?? '',
      queries: parsed.telemetry?.queries ?? [],
      duration_ms: parsed.telemetry?.duration_ms ?? 1.0,
      memory_kb: parsed.telemetry?.memory_kb ?? 2048,
      php_version: parsed.telemetry?.php_version ?? this.phpVersion,
      sqlite_version: parsed.telemetry?.sqlite_version ?? this.sqliteVersion,
      response_preview: parsed.data,
    };

    this.emitTrace(trace);
    return {
      status: parsed.status ?? 200,
      data: parsed.data as T,
      telemetry: trace,
    };
  }

  public async runTinker(phpExpression: string): Promise<{
    output: string;
    queries: SqlLogEntry[];
    duration_ms: number;
    ok: boolean;
  }> {
    await this.boot();
    const cleaned = phpExpression.trim().replace(/^<\?php\s*/i, '');
    const b64 = btoa(unescape(encodeURIComponent(cleaned)));

    const script = `<?php
error_reporting(E_ALL);
ini_set('display_errors', '0');
$start = microtime(true);
require_once '/app/bootstrap/boot.php';
use App\\Models\\Project;
use App\\Models\\RoadmapTask;
use App\\Models\\Endorsement;
use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Facades\\Route;
use Illuminate\\Support\\Facades\\Artisan;
use Illuminate\\Support\\Facades\\Validator;

DB::enableQueryLog();
$code = base64_decode('${b64}');

// Automatically return the evaluated expression if user didn't write explicit return/echo
if (!str_contains($code, 'return ') && !str_contains($code, 'echo ') && !str_contains($code, 'var_dump')) {
    $lines = array_values(array_filter(array_map('trim', explode(';', $code)), fn($l) => $l !== ''));
    if (count($lines) > 0) {
        $last = array_pop($lines);
        $code = (count($lines) ? implode('; ', $lines) . '; ' : '') . 'return ' . $last . ';';
    }
} elseif (!str_ends_with(rtrim($code), ';')) {
    $code .= ';';
}

ob_start();
$ok = true;
try {
    $result = eval($code);
    $printed = ob_get_clean();
    if ($printed !== '' && $result === null) {
        $formatted = $printed;
    } else {
        $formatted = ($printed ? $printed . "\\n" : '') . json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
} catch (\\Throwable $e) {
    ob_end_clean();
    $ok = false;
    $formatted = get_class($e) . ": " . $e->getMessage() . " (line " . $e->getLine() . ")";
}

echo json_encode([
    'ok' => $ok,
    'output' => $formatted,
    'queries' => DB::getQueryLog(),
    'duration_ms' => round((microtime(true) - $start) * 1000, 2),
]);
`;
    const raw = await this.runPhpScript(script);
    await this.persistSqliteToIndexedDB();
    const parsed = JSON.parse(raw);

    this.emitTrace({
      id: `tinker-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      method: 'TINKER',
      uri: 'php artisan tinker',
      status: parsed.ok ? 200 : 500,
      controller: 'TinkerRepl',
      action: 'eval',
      controller_file: '/app/bootstrap/boot.php',
      method_source: `1 | <?php\n2 | // Executed via Live In-Browser Laravel Tinker REPL\n3 | ${cleaned}`,
      file_source: cleaned,
      queries: parsed.queries ?? [],
      duration_ms: parsed.duration_ms ?? 1,
      memory_kb: 2048,
      php_version: this.phpVersion,
      sqlite_version: this.sqliteVersion,
      response_preview: parsed.output,
    });

    return parsed;
  }

  public async runArtisan(command: string): Promise<{ output: string; exit_code: number; duration_ms: number }> {
    await this.boot();
    const b64 = btoa(unescape(encodeURIComponent(command)));
    const script = `<?php
$start = microtime(true);
require_once '/app/bootstrap/boot.php';
\\Illuminate\\Support\\Facades\\DB::enableQueryLog();
$cmd = base64_decode('${b64}');
$res = \\Illuminate\\Support\\Facades\\Artisan::call($cmd);
$res['duration_ms'] = round((microtime(true) - $start) * 1000, 2);
$res['queries'] = \\Illuminate\\Support\\Facades\\DB::getQueryLog();
echo json_encode($res);
`;
    const raw = await this.runPhpScript(script);
    await this.persistSqliteToIndexedDB();
    const parsed = JSON.parse(raw);

    this.emitTrace({
      id: `artisan-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      method: 'ARTISAN',
      uri: `php artisan ${command}`,
      status: parsed.exit_code === 0 ? 200 : 400,
      controller: 'ArtisanKernel',
      action: command.split(' ')[0],
      controller_file: '/app/bootstrap/framework.php',
      method_source: `1 | $ php artisan ${command}\n2 | \n3 | ${parsed.output}`,
      file_source: LARAVEL_FS_FILES['/app/bootstrap/framework.php'],
      queries: parsed.queries ?? [],
      duration_ms: parsed.duration_ms ?? 1,
      memory_kb: 2048,
      php_version: this.phpVersion,
      sqlite_version: this.sqliteVersion,
      response_preview: parsed.output,
    });

    return parsed;
  }

  public async inspectDatabase(): Promise<TableDump[]> {
    await this.boot();
    const script = `<?php
require_once '/app/bootstrap/boot.php';
$pdo = \\Illuminate\\Support\\Facades\\DB::connection();
$tables = $pdo->query("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll();
$result = [];
foreach ($tables as $t) {
    $name = $t['name'];
    $rows = $pdo->query("SELECT * FROM {$name} ORDER BY id ASC")->fetchAll();
    $cols = [];
    if (count($rows) > 0) {
        $cols = array_keys($rows[0]);
    } else {
        $pragma = $pdo->query("PRAGMA table_info({$name})")->fetchAll();
        foreach ($pragma as $p) $cols[] = $p['name'];
    }
    $result[] = [
        'name' => $name,
        'sql' => $t['sql'],
        'count' => count($rows),
        'columns' => $cols,
        'rows' => $rows,
    ];
}
echo json_encode($result);
`;
    const raw = await this.runPhpScript(script);
    return JSON.parse(raw);
  }

  public async getFileContents(vfsPath: string): Promise<string> {
    await this.boot();
    if (!this.php || !this.php.fileExists(vfsPath)) {
      return LARAVEL_FS_FILES[vfsPath] ?? '';
    }
    return this.php.readFileAsText(vfsPath);
  }

  public async saveControllerSource(
    vfsPath: string,
    newCode: string
  ): Promise<{ ok: boolean; error?: string }> {
    await this.boot();
    if (!this.php) return { ok: false, error: 'Runtime not booted' };

    // Syntax check using token_get_all / lint before overwriting
    const b64 = btoa(unescape(encodeURIComponent(newCode)));
    const checkScript = `<?php
$code = base64_decode('${b64}');
$tmp = '/tmp/__lint_check.php';
file_put_contents($tmp, $code);
try {
    token_get_all($code, TOKEN_PARSE);
    echo json_encode(['ok' => true]);
} catch (\\ParseError $e) {
    echo json_encode(['ok' => false, 'error' => "PHP ParseError on line " . $e->getLine() . ": " . $e->getMessage()]);
}
`;
    const raw = await this.runPhpScript(checkScript);
    const lint = JSON.parse(raw);
    if (!lint.ok) {
      return lint;
    }

    this.php.writeFile(vfsPath, newCode);
    const saved = (await idbGet<Record<string, string>>(IDB_CONTROLLERS_KEY)) ?? {};
    saved[vfsPath] = newCode;
    await idbSet(IDB_CONTROLLERS_KEY, saved);

    return { ok: true };
  }

  public async resetControllerToDefault(vfsPath: string): Promise<string> {
    await this.boot();
    const original = LARAVEL_FS_FILES[vfsPath] ?? '';
    if (this.php && original) {
      this.php.writeFile(vfsPath, original);
    }
    const saved = (await idbGet<Record<string, string>>(IDB_CONTROLLERS_KEY)) ?? {};
    delete saved[vfsPath];
    await idbSet(IDB_CONTROLLERS_KEY, saved);
    return original;
  }

  public async exportSqliteBytes(): Promise<Uint8Array> {
    await this.boot();
    if (!this.php) throw new Error('PHP not booted');
    const buf = this.php.readFileAsBuffer('/app/database/database.sqlite');
    return new Uint8Array(buf);
  }

  public async resetAllFactoryState(): Promise<void> {
    await this.boot();
    if (!this.php) return;
    for (const [path, contents] of Object.entries(LARAVEL_FS_FILES)) {
      this.php.writeFile(path, contents);
    }
    await idbSet(IDB_CONTROLLERS_KEY, {});
    await this.runArtisan('migrate:fresh --seed');
  }
}

export const laravelKernel = new LaravelWasmKernel();
