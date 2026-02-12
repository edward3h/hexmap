<?php

declare(strict_types=1);

function getDb(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $configFile = __DIR__ . '/../../config.php';
        if (file_exists($configFile)) {
            require $configFile;
            $host = $DB_HOST;
            $name = $DB_NAME;
            $user = $DB_USER;
            $pass = $DB_PASS;
        } else {
            $host = getenv('DB_HOST') ?: 'localhost';
            $name = getenv('DB_NAME') ?: 'hexmap';
            $user = getenv('DB_USER') ?: 'hexmap';
            $pass = getenv('DB_PASS') ?: 'hexmap';
        }

        $dsn = "mysql:host=$host;dbname=$name;charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }

    return $pdo;
}
