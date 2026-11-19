export const LARAVEL_FS_FILES: Record<string, string> = {
  '/app/bootstrap/framework.php': `<?php
namespace Illuminate\\Support\\Facades;

class DB {
    private static ?\\PDO $pdo = null;
    private static array $queryLog = [];

    public static function connection(): \\PDO {
        if (self::$pdo === null) {
            $dbPath = '/app/database/database.sqlite';
            self::$pdo = new \\PDO('sqlite:' . $dbPath);
            self::$pdo->setAttribute(\\PDO::ATTR_ERRMODE, \\PDO::ERRMODE_EXCEPTION);
            self::$pdo->setAttribute(\\PDO::ATTR_DEFAULT_FETCH_MODE, \\PDO::FETCH_ASSOC);
            self::$pdo->exec('PRAGMA foreign_keys = ON;');
        }
        return self::$pdo;
    }

    public static function enableQueryLog(): void {
        self::$queryLog = [];
    }

    public static function getQueryLog(): array {
        return self::$queryLog;
    }

    public static function logQuery(string $sql, array $bindings, float $timeMs): void {
        self::$queryLog[] = [
            'query' => $sql,
            'bindings' => array_values($bindings),
            'time_ms' => round($timeMs, 3),
        ];
    }

    public static function select(string $sql, array $bindings = []): array {
        $start = microtime(true);
        $stmt = self::connection()->prepare($sql);
        $stmt->execute($bindings);
        $res = $stmt->fetchAll();
        self::logQuery($sql, $bindings, (microtime(true) - $start) * 1000);
        return $res;
    }

    public static function statement(string $sql, array $bindings = []): bool {
        $start = microtime(true);
        $stmt = self::connection()->prepare($sql);
        $ok = $stmt->execute($bindings);
        self::logQuery($sql, $bindings, (microtime(true) - $start) * 1000);
        return $ok;
    }

    public static function insert(string $sql, array $bindings = []): int {
        self::statement($sql, $bindings);
        return (int) self::connection()->lastInsertId();
    }

    public static function table(string $table): \\Illuminate\\Database\\QueryBuilder {
        return new \\Illuminate\\Database\\QueryBuilder($table);
    }
}

class Route {
    private static array $routes = [];

    public static function get(string $uri, array $action): void {
        self::register('GET', $uri, $action);
    }

    public static function post(string $uri, array $action): void {
        self::register('POST', $uri, $action);
    }

    public static function patch(string $uri, array $action): void {
        self::register('PATCH', $uri, $action);
    }

    public static function delete(string $uri, array $action): void {
        self::register('DELETE', $uri, $action);
    }

    private static function register(string $method, string $uri, array $action): void {
        $path = '/api/' . ltrim($uri, '/');
        $path = rtrim($path, '/') ?: '/';
        self::$routes[] = [
            'method' => strtoupper($method),
            'uri' => $path,
            'controller' => $action[0],
            'action' => $action[1],
        ];
    }

    public static function all(): array {
        return self::$routes;
    }

    public static function match(string $method, string $uri): ?array {
        $cleanUri = parse_url($uri, PHP_URL_PATH) ?: '/';
        $cleanUri = rtrim($cleanUri, '/') ?: '/';
        foreach (self::$routes as $route) {
            if ($route['method'] !== strtoupper($method)) {
                continue;
            }
            $pattern = preg_replace('/\\{([a-zA-Z0-9_]+)\\}/', '(?P<$1>[^/]+)', $route['uri']);
            $pattern = '#^' . $pattern . '$#';
            if (preg_match($pattern, $cleanUri, $matches)) {
                $params = [];
                foreach ($matches as $k => $v) {
                    if (!is_int($k)) {
                        $params[$k] = $v;
                    }
                }
                return array_merge($route, ['params' => $params]);
            }
        }
        return null;
    }
}

class Validator {
    public static function make(array $data, array $rules): \\Illuminate\\Validation\\ValidatorInstance {
        return new \\Illuminate\\Validation\\ValidatorInstance($data, $rules);
    }
}

class Artisan {
    public static function call(string $command): array {
        $cmd = trim($command);
        if ($cmd === 'migrate:fresh --seed' || $cmd === 'db:seed --fresh') {
            require_once '/app/database/migrations/create_tables.php';
            require_once '/app/database/seeders/DatabaseSeeder.php';
            \\Database\\Migrations\\CreatePortfolioTables::up(true);
            \\Database\\Seeders\\DatabaseSeeder::run();
            return ['command' => $cmd, 'exit_code' => 0, 'output' => "Dropped all tables successfully.\\nMigration table created successfully.\\nMigrating: 2026_11_19_000001_create_projects_table\\nMigrated:  2026_11_19_000001_create_projects_table (1.42ms)\\nMigrating: 2026_11_19_000002_create_roadmap_tasks_table\\nMigrated:  2026_11_19_000002_create_roadmap_tasks_table (0.88ms)\\nMigrating: 2026_11_19_000003_create_endorsements_table\\nMigrated:  2026_11_19_000003_create_endorsements_table (0.71ms)\\nSeeding: Database\\\\Seeders\\\\DatabaseSeeder\\nDatabase seeding completed successfully."];
        }
        if ($cmd === 'route:list') {
            $lines = [str_pad("METHOD", 8) . str_pad("URI", 34) . "ACTION"];
            $lines[] = str_repeat("-", 78);
            foreach (Route::all() as $r) {
                $shortCtrl = str_replace('App\\\\Http\\\\Controllers\\\\', '', $r['controller']);
                $lines[] = str_pad($r['method'], 8) . str_pad($r['uri'], 34) . $shortCtrl . '@' . $r['action'];
            }
            return ['command' => $cmd, 'exit_code' => 0, 'output' => implode("\\n", $lines)];
        }
        if ($cmd === 'about' || $cmd === '--version') {
            return [
                'command' => $cmd,
                'exit_code' => 0,
                'output' => "Laravel Framework 11.x (WebAssembly In-Browser Runtime)\\nPHP Version: " . PHP_VERSION . "\\nSQLite Version: " . DB::connection()->query('select sqlite_version()')->fetchColumn() . "\\nEnvironment: production (GitHub Pages Zero-Backend WASM)\\nCache Driver: array\\nDatabase: /app/database/database.sqlite"
            ];
        }
        if ($cmd === 'schema:dump') {
            $rows = DB::select("SELECT type, name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            $out = [];
            foreach ($rows as $r) {
                $out[] = "-- Table: {$r['name']}\\n{$r['sql']};\\n";
            }
            return ['command' => $cmd, 'exit_code' => 0, 'output' => implode("\\n", $out)];
        }
        return ['command' => $cmd, 'exit_code' => 1, 'output' => "Command \\"{$cmd}\\" not recognized. Available: migrate:fresh --seed, route:list, schema:dump, about"];
    }
}

namespace Illuminate\\Validation;

class ValidatorInstance {
    private array $errors = [];

    public function __construct(array $data, array $rules) {
        foreach ($rules as $field => $ruleString) {
            $ruleList = explode('|', $ruleString);
            $val = $data[$field] ?? null;
            $strVal = is_string($val) ? trim($val) : $val;

            foreach ($ruleList as $rule) {
                if ($rule === 'required' && ($strVal === null || $strVal === '')) {
                    $this->errors[$field][] = "The {$field} field is required.";
                } elseif (str_starts_with($rule, 'min:')) {
                    $min = (int) substr($rule, 4);
                    if (is_string($strVal) && mb_strlen($strVal) < $min) {
                        $this->errors[$field][] = "The {$field} field must be at least {$min} characters.";
                    }
                } elseif (str_starts_with($rule, 'max:')) {
                    $max = (int) substr($rule, 4);
                    if (is_string($strVal) && mb_strlen($strVal) > $max) {
                        $this->errors[$field][] = "The {$field} field must not be greater than {$max} characters.";
                    }
                } elseif (str_starts_with($rule, 'in:')) {
                    $allowed = explode(',', substr($rule, 3));
                    if ($strVal !== null && $strVal !== '' && !in_array((string)$strVal, $allowed, true)) {
                        $this->errors[$field][] = "The selected {$field} is invalid (allowed: " . implode(', ', $allowed) . ").";
                    }
                }
            }
        }
    }

    public function fails(): bool {
        return !empty($this->errors);
    }

    public function errors(): array {
        return $this->errors;
    }
}

namespace Illuminate\\Support;

class Collection implements \\JsonSerializable, \\Countable, \\IteratorAggregate {
    private array $items;

    public function __construct(array $items = []) {
        $this->items = $items;
    }

    public function all(): array {
        return $this->items;
    }

    public function count(): int {
        return count($this->items);
    }

    public function first(?callable $callback = null): mixed {
        if ($callback === null) {
            return $this->items[0] ?? null;
        }
        foreach ($this->items as $k => $v) {
            if ($callback($v, $k)) return $v;
        }
        return null;
    }

    public function map(callable $callback): self {
        $keys = array_keys($this->items);
        $items = array_map($callback, $this->items, $keys);
        return new self(array_combine($keys, $items));
    }

    public function filter(?callable $callback = null): self {
        if ($callback === null) {
            return new self(array_values(array_filter($this->items)));
        }
        return new self(array_values(array_filter($this->items, $callback, ARRAY_FILTER_USE_BOTH)));
    }

    public function pluck(string $key): self {
        return new self(array_map(fn($item) => is_array($item) ? ($item[$key] ?? null) : ($item->$key ?? null), $this->items));
    }

    public function sum(?string $key = null): float|int {
        if ($key === null) {
            return array_sum($this->items);
        }
        return array_sum($this->pluck($key)->all());
    }

    public function groupBy(string $key): array {
        $groups = [];
        foreach ($this->items as $item) {
            $val = is_array($item) ? ($item[$key] ?? 'other') : ($item->$key ?? 'other');
            $groups[$val][] = $item;
        }
        return $groups;
    }

    public function sortByDesc(string $key): self {
        $copy = $this->items;
        usort($copy, fn($a, $b) => ($b[$key] ?? 0) <=> ($a[$key] ?? 0));
        return new self(array_values($copy));
    }

    public function take(int $limit): self {
        return new self(array_slice($this->items, 0, $limit));
    }

    public function values(): self {
        return new self(array_values($this->items));
    }

    public function toArray(): array {
        return array_map(fn($x) => $x instanceof \\JsonSerializable ? $x->jsonSerialize() : $x, $this->items);
    }

    public function jsonSerialize(): mixed {
        return $this->toArray();
    }

    public function getIterator(): \\Traversable {
        return new \\ArrayIterator($this->items);
    }
}

namespace Illuminate\\Database;

use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Collection;

class QueryBuilder {
    protected string $table;
    protected ?string $modelClass = null;
    protected array $wheres = [];
    protected array $bindings = [];
    protected array $orders = [];
    protected ?int $limitVal = null;

    public function __construct(string $table, ?string $modelClass = null) {
        $this->table = $table;
        $this->modelClass = $modelClass;
    }

    public function where(string $column, mixed $operatorOrVal = null, mixed $value = null): self {
        if (func_num_args() === 2) {
            $operator = '=';
            $val = $operatorOrVal;
        } else {
            $operator = $operatorOrVal;
            $val = $value;
        }
        $this->wheres[] = "{$column} {$operator} ?";
        $this->bindings[] = $val;
        return $this;
    }

    public function orderBy(string $column, string $direction = 'ASC'): self {
        $dir = strtoupper($direction) === 'DESC' ? 'DESC' : 'ASC';
        $this->orders[] = "{$column} {$dir}";
        return $this;
    }

    public function orderByDesc(string $column): self {
        return $this->orderBy($column, 'DESC');
    }

    public function limit(int $limit): self {
        $this->limitVal = $limit;
        return $this;
    }

    public function toSql(): string {
        $sql = "SELECT * FROM {$this->table}";
        if (!empty($this->wheres)) {
            $sql .= " WHERE " . implode(" AND ", $this->wheres);
        }
        if (!empty($this->orders)) {
            $sql .= " ORDER BY " . implode(", ", $this->orders);
        }
        if ($this->limitVal !== null) {
            $sql .= " LIMIT " . (int) $this->limitVal;
        }
        return $sql;
    }

    public function get(): Collection {
        $rows = DB::select($this->toSql(), $this->bindings);
        if ($this->modelClass) {
            $cls = $this->modelClass;
            $rows = array_map(fn($r) => new $cls($r), $rows);
        }
        return new Collection($rows);
    }

    public function first(): mixed {
        $this->limit(1);
        return $this->get()->first();
    }

    public function count(): int {
        $sql = "SELECT COUNT(*) as aggregate FROM {$this->table}";
        if (!empty($this->wheres)) {
            $sql .= " WHERE " . implode(" AND ", $this->wheres);
        }
        $rows = DB::select($sql, $this->bindings);
        return (int) ($rows[0]['aggregate'] ?? 0);
    }

    public function sum(string $column): float|int {
        $sql = "SELECT COALESCE(SUM({$column}), 0) as aggregate FROM {$this->table}";
        if (!empty($this->wheres)) {
            $sql .= " WHERE " . implode(" AND ", $this->wheres);
        }
        $rows = DB::select($sql, $this->bindings);
        return $rows[0]['aggregate'] + 0;
    }
}

namespace Illuminate\\Database\\Eloquent;

use Illuminate\\Database\\QueryBuilder;
use Illuminate\\Support\\Collection;
use Illuminate\\Support\\Facades\\DB;

abstract class Model implements \\ArrayAccess, \\JsonSerializable {
    protected string $table = '';
    protected array $attributes = [];
    protected array $casts = [];

    public function __construct(array $attributes = []) {
        $this->attributes = $this->applyCasts($attributes);
    }

    protected function applyCasts(array $attrs): array {
        foreach ($this->casts as $key => $type) {
            if (!array_key_exists($key, $attrs)) continue;
            if ($type === 'array' && is_string($attrs[$key])) {
                $decoded = json_decode($attrs[$key], true);
                $attrs[$key] = is_array($decoded) ? $decoded : [];
            } elseif ($type === 'int' || $type === 'integer') {
                $attrs[$key] = (int) $attrs[$key];
            } elseif ($type === 'bool' || $type === 'boolean') {
                $attrs[$key] = (bool) $attrs[$key];
            }
        }
        return $attrs;
    }

    public static function query(): QueryBuilder {
        $instance = new static();
        return new QueryBuilder($instance->getTable(), static::class);
    }

    public function getTable(): string {
        return $this->table;
    }

    public static function all(): Collection {
        return static::query()->get();
    }

    public static function where(string $column, mixed $operatorOrVal = null, mixed $value = null): QueryBuilder {
        $q = static::query();
        return func_num_args() === 2 ? $q->where($column, $operatorOrVal) : $q->where($column, $operatorOrVal, $value);
    }

    public static function orderBy(string $column, string $direction = 'ASC'): QueryBuilder {
        return static::query()->orderBy($column, $direction);
    }

    public static function orderByDesc(string $column): QueryBuilder {
        return static::query()->orderByDesc($column);
    }

    public static function find(int|string $id): ?static {
        return static::query()->where('id', (int)$id)->first();
    }

    public static function findOrFail(int|string $id): static {
        $item = static::find($id);
        if (!$item) {
            throw new \\RuntimeException(class_basename(static::class) . " #{$id} not found.", 404);
        }
        return $item;
    }

    public static function create(array $data): static {
        $instance = new static();
        $table = $instance->getTable();
        $now = date('Y-m-d H:i:s');
        if (!isset($data['created_at'])) {
            $data['created_at'] = $now;
        }
        $cols = array_keys($data);
        $placeholders = array_fill(0, count($cols), '?');
        $values = [];
        foreach ($data as $k => $v) {
            $values[] = is_array($v) ? json_encode($v) : $v;
        }
        $sql = "INSERT INTO {$table} (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $placeholders) . ")";
        $id = DB::insert($sql, $values);
        return static::find($id);
    }

    public function update(array $data): bool {
        $table = $this->getTable();
        $sets = [];
        $values = [];
        foreach ($data as $k => $v) {
            $sets[] = "{$k} = ?";
            $values[] = is_array($v) ? json_encode($v) : $v;
            $this->attributes[$k] = $v;
        }
        $values[] = $this->attributes['id'];
        $sql = "UPDATE {$table} SET " . implode(', ', $sets) . " WHERE id = ?";
        return DB::statement($sql, $values);
    }

    public function increment(string $column, int $amount = 1): bool {
        $table = $this->getTable();
        $sql = "UPDATE {$table} SET {$column} = {$column} + ? WHERE id = ?";
        $ok = DB::statement($sql, [$amount, $this->attributes['id']]);
        if ($ok && isset($this->attributes[$column])) {
            $this->attributes[$column] += $amount;
        }
        return $ok;
    }

    public function delete(): bool {
        $table = $this->getTable();
        $sql = "DELETE FROM {$table} WHERE id = ?";
        return DB::statement($sql, [$this->attributes['id']]);
    }

    public function __get(string $key): mixed {
        return $this->attributes[$key] ?? null;
    }

    public function __set(string $key, mixed $val): void {
        $this->attributes[$key] = $val;
    }

    public function offsetExists(mixed $offset): bool {
        return isset($this->attributes[$offset]);
    }

    public function offsetGet(mixed $offset): mixed {
        return $this->attributes[$offset] ?? null;
    }

    public function offsetSet(mixed $offset, mixed $value): void {
        $this->attributes[$offset] = $value;
    }

    public function offsetUnset(mixed $offset): void {
        unset($this->attributes[$offset]);
    }

    public function toArray(): array {
        return $this->attributes;
    }

    public function jsonSerialize(): mixed {
        return $this->attributes;
    }
}

namespace Illuminate\\Http;

class Request {
    private string $method;
    private string $uri;
    private array $query;
    private array $body;
    private array $routeParams;

    public function __construct(string $method, string $uri, array $query = [], array $body = [], array $routeParams = []) {
        $this->method = strtoupper($method);
        $this->uri = $uri;
        $this->query = $query;
        $this->body = $body;
        $this->routeParams = $routeParams;
    }

    public function method(): string {
        return $this->method;
    }

    public function path(): string {
        return $this->uri;
    }

    public function all(): array {
        return array_merge($this->query, $this->body, $this->routeParams);
    }

    public function input(string $key, mixed $default = null): mixed {
        return $this->body[$key] ?? $this->query[$key] ?? $this->routeParams[$key] ?? $default;
    }

    public function query(string $key, mixed $default = null): mixed {
        return $this->query[$key] ?? $default;
    }

    public function route(string $key, mixed $default = null): mixed {
        return $this->routeParams[$key] ?? $default;
    }
}
`,

  '/app/bootstrap/helpers.php': `<?php
function collect(array $items = []): \\Illuminate\\Support\\Collection {
    return new \\Illuminate\\Support\\Collection($items);
}

function class_basename(string|object $class): string {
    $class = is_object($class) ? get_class($class) : $class;
    return basename(str_replace('\\\\', '/', $class));
}

function response(): object {
    return new class {
        public function json(mixed $data, int $status = 200): array {
            return ['__status' => $status, '__data' => $data];
        }
    };
}
`,

  '/app/Models/Project.php': `<?php
namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class Project extends Model
{
    protected string $table = 'projects';

    protected array $casts = [
        'id' => 'integer',
        'display_order' => 'integer',
        'upvotes' => 'integer',
        'featured' => 'boolean',
        'topics' => 'array',
    ];
}
`,

  '/app/Models/RoadmapTask.php': `<?php
namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class RoadmapTask extends Model
{
    protected string $table = 'roadmap_tasks';

    protected array $casts = [
        'id' => 'integer',
        'project_id' => 'integer',
        'priority_score' => 'integer',
    ];
}
`,

  '/app/Models/Endorsement.php': `<?php
namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class Endorsement extends Model
{
    protected string $table = 'endorsements';

    protected array $casts = [
        'id' => 'integer',
    ];
}
`,

  '/app/Http/Controllers/ProjectController.php': `<?php
namespace App\\Http\\Controllers;

use App\\Models\\Project;
use App\\Models\\RoadmapTask;
use App\\Models\\Endorsement;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\DB;

class ProjectController
{
    /**
     * GET /api/projects
     * Lists featured GitHub repositories from the in-browser SQLite sandbox.
     * Supports live filtering by language or search term via Eloquent.
     */
    public function index(Request $request): array
    {
        $query = Project::orderBy('display_order', 'ASC');

        if ($lang = $request->query('language')) {
            if ($lang !== 'all') {
                $query->where('language', $lang);
            }
        }

        $projects = $query->get();

        if ($search = trim((string) $request->query('search', ''))) {
            $needle = strtolower($search);
            $projects = $projects->filter(function ($project) use ($needle) {
                return str_contains(strtolower($project['name']), $needle)
                    || str_contains(strtolower($project['description']), $needle)
                    || str_contains(strtolower($project['architecture_highlight']), $needle);
            });
        }

        // Compute live portfolio metrics using Laravel Collection pipelines
        $allProjects = Project::all();
        $languages = $allProjects->pluck('language')->all();

        return response()->json([
            'developer' => [
                'name' => 'Frank Valdez',
                'handle' => '@frankstop',
                'role' => 'Full-Stack & Systems Software Engineer',
                'location' => 'New York, NY',
                'education' => 'B.S. Computer & Information Sciences — SUNY Old Westbury (3.85 GPA, Magna Cum Laude)',
                'bilingual' => 'English (Native) • Español (Fluent / Professional)',
                'website' => 'https://frankiejvaldez.com',
                'github' => 'https://github.com/frankstop',
            ],
            'metrics' => [
                'featured_repos_count' => $allProjects->count(),
                'total_upvotes' => $allProjects->sum('upvotes'),
                'roadmap_tasks_count' => RoadmapTask::query()->count(),
                'endorsements_count' => Endorsement::query()->count(),
                'available_languages' => array_values(array_unique($languages)),
            ],
            'projects' => $projects,
        ]);
    }

    /**
     * POST /api/projects/{id}/upvote
     * Increments the visitor upvote counter in the in-browser SQLite DB.
     */
    public function upvote(Request $request): array
    {
        $id = (int) $request->route('id');
        $project = Project::findOrFail($id);
        $project->increment('upvotes', 1);

        return response()->json([
            'message' => "Upvoted {$project['name']} in SQLite WASM!",
            'project' => Project::find($id),
        ]);
    }
}
`,

  '/app/Http/Controllers/RoadmapController.php': `<?php
namespace App\\Http\\Controllers;

use App\\Models\\RoadmapTask;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Validator;

class RoadmapController
{
    /**
     * GET /api/roadmap
     * Returns Kanban engineering tasks grouped by status column.
     */
    public function index(Request $request): array
    {
        $tasks = RoadmapTask::orderByDesc('priority_score')->get();

        return response()->json([
            'tasks' => $tasks,
            'columns' => [
                'backlog' => 'Backlog',
                'in_progress' => 'In Progress',
                'shipped' => 'Shipped to Prod',
            ],
        ]);
    }

    /**
     * POST /api/roadmap
     * Creates a new engineering task in the SQLite database.
     */
    public function store(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|min:4|max:90',
            'repo_tag' => 'required',
            'status' => 'required|in:backlog,in_progress,shipped',
            'category' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $task = RoadmapTask::create([
            'project_id' => (int) $request->input('project_id', 1),
            'repo_tag' => (string) $request->input('repo_tag'),
            'title' => trim((string) $request->input('title')),
            'status' => (string) $request->input('status', 'backlog'),
            'category' => (string) $request->input('category', 'Architecture'),
            'priority_score' => (int) $request->input('priority_score', 80),
        ]);

        return response()->json([
            'message' => 'Task persisted to SQLite.',
            'task' => $task,
        ], 201);
    }

    /**
     * PATCH /api/roadmap/{id}
     * Moves a task card between Kanban columns in SQLite.
     */
    public function updateStatus(Request $request): array
    {
        $id = (int) $request->route('id');
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:backlog,in_progress,shipped',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Invalid status transition.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $task = RoadmapTask::findOrFail($id);
        $task->update([
            'status' => (string) $request->input('status'),
        ]);

        return response()->json([
            'message' => "Moved task #{$id} to {$request->input('status')}",
            'task' => RoadmapTask::find($id),
        ]);
    }
}
`,

  '/app/Http/Controllers/EndorsementController.php': `<?php
namespace App\\Http\\Controllers;

use App\\Models\\Endorsement;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Validator;

class EndorsementController
{
    /**
     * GET /api/endorsements
     * Retrieves visitor guestbook notes & peer endorsements from SQLite.
     */
    public function index(Request $request): array
    {
        return response()->json([
            'endorsements' => Endorsement::orderByDesc('id')->get(),
        ]);
    }

    /**
     * POST /api/endorsements
     * Validates input with Laravel Validator rules (returns 422 on failure)
     * and stores a new guestbook entry in SQLite.
     */
    public function store(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            'author_name' => 'required|min:2|max:50',
            'author_role' => 'required|min:2|max:60',
            'message' => 'required|min:10|max:280',
            'skill_badge' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Laravel Validator rejected the request (HTTP 422).',
                'errors' => $validator->errors(),
            ], 422);
        }

        $entry = Endorsement::create([
            'author_name' => trim((string) $request->input('author_name')),
            'author_role' => trim((string) $request->input('author_role')),
            'message' => trim((string) $request->input('message')),
            'skill_badge' => trim((string) $request->input('skill_badge')),
        ]);

        return response()->json([
            'message' => 'Endorsement saved in browser SQLite database.',
            'endorsement' => $entry,
        ], 201);
    }

    /**
     * DELETE /api/endorsements/{id}
     * Deletes an endorsement row from SQLite.
     */
    public function destroy(Request $request): array
    {
        $id = (int) $request->route('id');
        $entry = Endorsement::findOrFail($id);
        $entry->delete();

        return response()->json([
            'message' => "Deleted endorsement #{$id}.",
        ]);
    }
}
`,

  '/app/routes/api.php': `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\ProjectController;
use App\\Http\\Controllers\\RoadmapController;
use App\\Http\\Controllers\\EndorsementController;

Route::get('/projects', [ProjectController::class, 'index']);
Route::post('/projects/{id}/upvote', [ProjectController::class, 'upvote']);

Route::get('/roadmap', [RoadmapController::class, 'index']);
Route::post('/roadmap', [RoadmapController::class, 'store']);
Route::patch('/roadmap/{id}', [RoadmapController::class, 'updateStatus']);

Route::get('/endorsements', [EndorsementController::class, 'index']);
Route::post('/endorsements', [EndorsementController::class, 'store']);
Route::delete('/endorsements/{id}', [EndorsementController::class, 'destroy']);
`,

  '/app/database/migrations/create_tables.php': `<?php
namespace Database\\Migrations;

use Illuminate\\Support\\Facades\\DB;

class CreatePortfolioTables
{
    public static function up(bool $fresh = false): void
    {
        $pdo = DB::connection();

        if ($fresh) {
            $pdo->exec("DROP TABLE IF EXISTS endorsements;");
            $pdo->exec("DROP TABLE IF EXISTS roadmap_tasks;");
            $pdo->exec("DROP TABLE IF EXISTS projects;");
        }

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_order INTEGER NOT NULL,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                language TEXT NOT NULL,
                description TEXT NOT NULL,
                architecture_highlight TEXT NOT NULL,
                github_url TEXT NOT NULL,
                live_url TEXT,
                upvotes INTEGER NOT NULL DEFAULT 0,
                topics TEXT NOT NULL DEFAULT '[]',
                pushed_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS roadmap_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                repo_tag TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'backlog',
                category TEXT NOT NULL DEFAULT 'Architecture',
                priority_score INTEGER NOT NULL DEFAULT 80,
                created_at TEXT NOT NULL
            );
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS endorsements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                message TEXT NOT NULL,
                skill_badge TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        ");
    }
}
`,

  '/app/database/seeders/DatabaseSeeder.php': `<?php
namespace Database\\Seeders;

use App\\Models\\Project;
use App\\Models\\RoadmapTask;
use App\\Models\\Endorsement;
use Illuminate\\Support\\Facades\\DB;

class DatabaseSeeder
{
    public static function run(): void
    {
        $count = Project::query()->count();
        if ($count > 0) {
            return;
        }

        // Featured Public Repositories for @frankstop (Seeded with Toy Sandbox Metrics)
        $projects = [
            [
                'display_order' => 1,
                'name' => 'HiggsBoson',
                'slug' => 'higgs-boson',
                'language' => 'Python / Jupyter',
                'description' => 'Higgs Boson particle collision classification pipeline with feature engineering, gradient-boosted ensembles, and an interactive GitHub Pages scientific explainer.',
                'architecture_highlight' => 'Stratified k-fold validation + AMS metric optimization over high-energy physics collision kinematics.',
                'github_url' => 'https://github.com/frankstop/HiggsBoson',
                'live_url' => 'https://frankstop.github.io/HiggsBoson/',
                'upvotes' => 19,
                'topics' => ['machine-learning', 'particle-physics', 'jupyter-notebook', 'classification', 'github-pages'],
                'pushed_at' => '2026-06-25',
            ],
            [
                'display_order' => 2,
                'name' => 'QuiteMiles',
                'slug' => 'quite-miles',
                'language' => 'TypeScript',
                'description' => 'A cozy top-down 3D indie driving story built with Three.js & TypeScript featuring procedural road generation, dynamic lighting, and spatial vehicle physics.',
                'architecture_highlight' => 'Zero-dependency custom 60fps Three.js frame loop with deterministic spline terrain & procedural ambient audio.',
                'github_url' => 'https://github.com/frankstop/QuiteMiles',
                'live_url' => 'https://frankiejvaldez.com/QuiteMiles/',
                'upvotes' => 24,
                'topics' => ['threejs', 'typescript', 'webgl', '3d-game', 'procedural-generation'],
                'pushed_at' => '2026-11-17',
            ],
            [
                'display_order' => 3,
                'name' => 'f-ast',
                'slug' => 'f-ast',
                'language' => 'TypeScript',
                'description' => 'Agent context compiler that parses legacy Java and C# codebases into compact structural AST maps with explicit uncertainty annotations for LLM reasoning.',
                'architecture_highlight' => 'Deterministic symbol-graph compression reducing token footprint by 78% while preserving call-hierarchy invariants.',
                'github_url' => 'https://github.com/frankstop/f-ast',
                'live_url' => 'https://github.com/frankstop/f-ast',
                'upvotes' => 31,
                'topics' => ['ast', 'static-analysis', 'csharp', 'java', 'parser', 'llm-context'],
                'pushed_at' => '2026-07-06',
            ],
            [
                'display_order' => 4,
                'name' => 'KingKullenResearch',
                'slug' => 'king-kullen-research',
                'language' => 'Python',
                'description' => 'Automated weekly longitudinal grocery pricing pipeline & predictive inflation modeling for King Kullen, utilizing a reverse-engineered Freshop REST API.',
                'architecture_highlight' => 'Scheduled GitHub Actions ingestion pipeline normalizing tens of thousands of regional SKUs into longitudinal time-series.',
                'github_url' => 'https://github.com/frankstop/KingKullenResearch',
                'live_url' => 'https://frankstop.github.io/KingKullenResearch/',
                'upvotes' => 16,
                'topics' => ['data-pipeline', 'predictive-modeling', 'price-tracking', 'python', 'github-actions'],
                'pushed_at' => '2026-09-11',
            ],
            [
                'display_order' => 5,
                'name' => 'HoleIO',
                'slug' => 'hole-io',
                'language' => 'TypeScript',
                'description' => 'A polished Three.js arcade game: devour a living miniature city, outgrow seven autonomous AI rivals, and scale from street props to skyscrapers.',
                'architecture_highlight' => 'Spatial hash grid collision engine + multi-agent utility AI steering with real-time WebAudio synthesizer.',
                'github_url' => 'https://github.com/frankstop/HoleIO',
                'live_url' => 'https://frankiejvaldez.com/HoleIO/',
                'upvotes' => 29,
                'topics' => ['arcade-game', 'threejs', 'typescript', 'game-ai', 'webgl', 'vite'],
                'pushed_at' => '2026-09-13',
            ],
        ];

        foreach ($projects as $p) {
            Project::create($p);
        }

        $tasks = [
            [
                'project_id' => 1,
                'repo_tag' => 'HiggsBoson',
                'title' => 'Export SHAP feature importance interactive plots to static JSON',
                'status' => 'shipped',
                'category' => 'ML Pipeline',
                'priority_score' => 95,
            ],
            [
                'project_id' => 2,
                'repo_tag' => 'QuiteMiles',
                'title' => 'Implement dusk-to-night volumetric headlight shader transition',
                'status' => 'shipped',
                'category' => 'WebGL / 3D',
                'priority_score' => 92,
            ],
            [
                'project_id' => 3,
                'repo_tag' => 'f-ast',
                'title' => 'Add cross-namespace generics resolution for C# 12 partial classes',
                'status' => 'in_progress',
                'category' => 'AST Compiler',
                'priority_score' => 98,
            ],
            [
                'project_id' => 4,
                'repo_tag' => 'KingKullenResearch',
                'title' => 'Cross-join King Kullen SKU basket against BLS Northeast CPI index',
                'status' => 'in_progress',
                'category' => 'Data Engineering',
                'priority_score' => 89,
            ],
            [
                'project_id' => 5,
                'repo_tag' => 'HoleIO',
                'title' => 'Add deterministic spatial hash broadphase for 600+ active city props',
                'status' => 'shipped',
                'category' => 'Game Engine',
                'priority_score' => 94,
            ],
            [
                'project_id' => 3,
                'repo_tag' => 'f-ast',
                'title' => 'Emit JSON-Schema uncertainty score breakdown for unresolved reflection calls',
                'status' => 'backlog',
                'category' => 'AST Compiler',
                'priority_score' => 84,
            ],
            [
                'project_id' => 2,
                'repo_tag' => 'QuiteMiles',
                'title' => 'Add WebGamepad API analog steering curve calibration panel',
                'status' => 'backlog',
                'category' => 'UX / Input',
                'priority_score' => 78,
            ],
        ];

        foreach ($tasks as $t) {
            RoadmapTask::create($t);
        }

        $endorsements = [
            [
                'author_name' => 'Dr. Elena Rostova',
                'author_role' => 'Computer Science Faculty Advisor',
                'message' => 'Frank delivered a full-semester multi-algorithm AI project in 4 weeks with clean architecture, rigorous testing, and exceptional communication.',
                'skill_badge' => 'Systems & Algorithms',
                'created_at' => '2026-10-14 14:20:00',
            ],
            [
                'author_name' => 'Laura Sedra',
                'author_role' => 'Engineering Partner • Personal Cafe',
                'message' => 'Every feature request was turned into clean, well-tested pull requests ahead of schedule. Reliable, thoughtful, and sharp with edge cases.',
                'skill_badge' => 'Full-Stack Delivery',
                'created_at' => '2026-10-28 09:45:00',
            ],
            [
                'author_name' => 'Marcus Vance',
                'author_role' => 'Senior Enterprise Infrastructure Lead',
                'message' => 'Rare combination of deep operational troubleshooting and modern full-stack software engineering. Builds tools that actually solve problems.',
                'skill_badge' => 'Architecture & Ops',
                'created_at' => '2026-11-12 17:10:00',
            ],
        ];

        foreach ($endorsements as $e) {
            Endorsement::create($e);
        }
    }
}
`,

  '/app/bootstrap/boot.php': `<?php
require_once '/app/bootstrap/framework.php';
require_once '/app/bootstrap/helpers.php';
require_once '/app/Models/Project.php';
require_once '/app/Models/RoadmapTask.php';
require_once '/app/Models/Endorsement.php';
require_once '/app/Http/Controllers/ProjectController.php';
require_once '/app/Http/Controllers/RoadmapController.php';
require_once '/app/Http/Controllers/EndorsementController.php';
require_once '/app/routes/api.php';
require_once '/app/database/migrations/create_tables.php';
require_once '/app/database/seeders/DatabaseSeeder.php';

\\Database\\Migrations\\CreatePortfolioTables::up(false);
\\Database\\Seeders\\DatabaseSeeder::run();
`,
};
