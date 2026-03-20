<?php
/**
 * Database migration runner.
 * Usage: php ~/hexmap.ordoacerbus.com/migrate.php
 *
 * Reads .sql files from migrations/ alphabetically and applies any that
 * haven't been recorded in schema_migrations yet.
 */

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    fwrite(STDERR, "Error: config.php not found at $configFile\n");
    exit(1);
}

require $configFile;

$dsn = "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4";
try {
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "DB connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

// Ensure tracking table exists
$pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

// Load already-applied migrations
$applied = $pdo->query("SELECT filename FROM schema_migrations")
    ->fetchAll(PDO::FETCH_COLUMN, 0);
$applied = array_flip($applied);

// Find migration files
$migrationsDir = __DIR__ . '/migrations';
$files = glob("$migrationsDir/*.sql");
sort($files);

$ran = 0;
foreach ($files as $path) {
    $filename = basename($path);
    if (isset($applied[$filename])) {
        continue;
    }

    echo "Applying $filename…\n";
    $sql = file_get_contents($path);
    $pdo->exec($sql);
    $stmt = $pdo->prepare("INSERT INTO schema_migrations (filename) VALUES (?)");
    $stmt->execute([$filename]);
    $ran++;
}

if ($ran === 0) {
    echo "No pending migrations.\n";
} else {
    echo "$ran migration(s) applied.\n";
}
