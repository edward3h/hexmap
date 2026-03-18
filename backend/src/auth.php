<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Load OAuth config from config.php variables or environment.
 */
function getOAuthConfig(): array
{
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $configFile = __DIR__ . '/../config.php';
    if (file_exists($configFile)) {
        // Use global so config variables defined in config.php land in global scope
        // and are accessible here. require_once inside a function would scope them locally.
        global $GOOGLE_CLIENT_ID, $GOOGLE_CLIENT_SECRET, $GOOGLE_REDIRECT_URI,
               $DISCORD_CLIENT_ID, $DISCORD_CLIENT_SECRET, $DISCORD_REDIRECT_URI;
        require_once $configFile;
        $cfg = [
            'google' => [
                'client_id'     => $GOOGLE_CLIENT_ID ?? '',
                'client_secret' => $GOOGLE_CLIENT_SECRET ?? '',
                'redirect_uri'  => $GOOGLE_REDIRECT_URI ?? '',
            ],
            'discord' => [
                'client_id'     => $DISCORD_CLIENT_ID ?? '',
                'client_secret' => $DISCORD_CLIENT_SECRET ?? '',
                'redirect_uri'  => $DISCORD_REDIRECT_URI ?? '',
            ],
        ];
    } else {
        $cfg = [
            'google' => [
                'client_id'     => getenv('GOOGLE_CLIENT_ID') ?: '',
                'client_secret' => getenv('GOOGLE_CLIENT_SECRET') ?: '',
                'redirect_uri'  => getenv('GOOGLE_REDIRECT_URI') ?: '',
            ],
            'discord' => [
                'client_id'     => getenv('DISCORD_CLIENT_ID') ?: '',
                'client_secret' => getenv('DISCORD_CLIENT_SECRET') ?: '',
                'redirect_uri'  => getenv('DISCORD_REDIRECT_URI') ?: '',
            ],
        ];
    }
    return $cfg;
}

/**
 * Build the OAuth provider login URL and store state in PHP session.
 */
function getOAuthLoginUrl(string $provider): string
{
    $cfg = getOAuthConfig()[$provider] ?? null;
    if (!$cfg) {
        throw new \InvalidArgumentException("Unknown provider: $provider");
    }

    $state = bin2hex(random_bytes(16));
    if (session_status() === PHP_SESSION_NONE) session_start();
    $_SESSION['oauth_state']    = $state;
    $_SESSION['oauth_provider'] = $provider;

    if ($provider === 'google') {
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
            'client_id'     => $cfg['client_id'],
            'redirect_uri'  => $cfg['redirect_uri'],
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'state'         => $state,
        ]);
    }

    // discord
    return 'https://discord.com/oauth2/authorize?' . http_build_query([
        'client_id'     => $cfg['client_id'],
        'redirect_uri'  => $cfg['redirect_uri'],
        'response_type' => 'code',
        'scope'         => 'identify email',
        'state'         => $state,
    ]);
}

/**
 * Exchange OAuth authorisation code for an access token.
 */
function exchangeOAuthCode(string $provider, string $code): array
{
    $cfg = getOAuthConfig()[$provider];

    $tokenUrl = $provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://discord.com/api/oauth2/token';

    $params = [
        'code'          => $code,
        'client_id'     => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'],
        'redirect_uri'  => $cfg['redirect_uri'],
        'grant_type'    => 'authorization_code',
    ];

    $ch = curl_init($tokenUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($params),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    $curlError = curl_errno($ch) ? curl_error($ch) : null;
    curl_close($ch);

    if ($curlError || $response === false) {
        error_log("OAuth token exchange failed for $provider: " . ($curlError ?? 'unknown'));
        throw new \RuntimeException("OAuth token exchange failed");
    }

    return json_decode((string)$response, true) ?? [];
}

/**
 * Fetch user profile from OAuth provider using access token.
 */
function fetchOAuthUserInfo(string $provider, string $accessToken): array
{
    $url = $provider === 'google'
        ? 'https://www.googleapis.com/oauth2/v3/userinfo'
        : 'https://discord.com/api/users/@me';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer $accessToken"],
    ]);
    $response = curl_exec($ch);
    $curlError = curl_errno($ch) ? curl_error($ch) : null;
    curl_close($ch);

    if ($curlError || $response === false) {
        error_log("OAuth userinfo fetch failed for $provider: " . ($curlError ?? 'unknown'));
        throw new \RuntimeException("OAuth userinfo fetch failed");
    }

    return json_decode((string)$response, true) ?? [];
}

/**
 * Normalise provider-specific user info into a common shape.
 *
 * @return array{oauth_id: string, email: string, display_name: string, avatar_url: string|null}
 */
function normalizeUserInfo(string $provider, array $info): array
{
    if ($provider === 'google') {
        return [
            'oauth_id'     => (string)($info['sub'] ?? ''),
            'email'        => (string)($info['email'] ?? ''),
            'display_name' => (string)($info['name'] ?? $info['email'] ?? ''),
            'avatar_url'   => $info['picture'] ?? null,
        ];
    }

    // discord
    $avatarUrl = null;
    if (!empty($info['avatar'])) {
        $avatarUrl = "https://cdn.discordapp.com/avatars/{$info['id']}/{$info['avatar']}.png";
    }
    return [
        'oauth_id'     => (string)($info['id'] ?? ''),
        'email'        => (string)($info['email'] ?? ''),
        'display_name' => (string)($info['global_name'] ?? $info['username'] ?? ''),
        'avatar_url'   => $avatarUrl,
    ];
}

/**
 * Find or create user by OAuth identity.
 * Matches existing users by email to link multiple providers.
 *
 * @return int  The user's id
 */
function upsertUser(PDO $db, string $provider, array $userInfo): int
{
    // 1. Existing OAuth link?
    $stmt = $db->prepare('SELECT user_id FROM user_oauth_providers WHERE provider = ? AND oauth_id = ?');
    $stmt->execute([$provider, $userInfo['oauth_id']]);
    $row = $stmt->fetch();
    if ($row) {
        return (int)$row['user_id'];
    }

    // 2. Existing user by email?
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$userInfo['email']]);
    $row = $stmt->fetch();

    if ($row) {
        $userId = (int)$row['id'];
    } else {
        // 3. Create new user — INSERT IGNORE handles concurrent first-login race condition.
        //    If a duplicate email is inserted concurrently, lastInsertId() returns 0;
        //    we re-fetch by email to get the winner's id.
        $stmt = $db->prepare('INSERT IGNORE INTO users (email, display_name, avatar_url) VALUES (?, ?, ?)');
        $stmt->execute([$userInfo['email'], $userInfo['display_name'], $userInfo['avatar_url']]);
        $insertId = (int)$db->lastInsertId();

        if ($insertId > 0) {
            $userId = $insertId;
        } else {
            // Race: another request inserted first — fetch the existing row
            $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([$userInfo['email']]);
            $userId = (int)$stmt->fetchColumn();
        }
    }

    // 4. Link this OAuth provider to the user
    $stmt = $db->prepare('INSERT INTO user_oauth_providers (user_id, provider, oauth_id) VALUES (?, ?, ?)');
    $stmt->execute([$userId, $provider, $userInfo['oauth_id']]);

    return $userId;
}

/**
 * Create a new 30-day session for a user.
 *
 * @return string  The session token
 */
function createSession(PDO $db, int $userId): string
{
    $token     = bin2hex(random_bytes(32)); // 64 hex chars
    $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

    $stmt = $db->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
    $stmt->execute([$token, $userId, $expiresAt]);

    return $token;
}
