<?php
// backend/src/handlers/auth.php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';

/**
 * GET /api/auth/login?provider=google|discord
 * Redirects user to OAuth provider.
 */
function handleAuthLogin(string $provider): never
{
    if (!in_array($provider, ['google', 'discord'], true)) {
        jsonResponse(['error' => 'Invalid provider. Use google or discord.'], 400);
    }

    $url = getOAuthLoginUrl($provider);
    header('Location: ' . $url, true, 302);
    exit;
}

/**
 * GET /api/auth/callback?provider=...&code=...&state=...
 * Receives OAuth callback, creates session, redirects to /admin with token in hash.
 */
function handleAuthCallback(string $provider): never
{
    if (session_status() === PHP_SESSION_NONE) session_start();

    $storedState = $_SESSION['oauth_state'] ?? '';
    $state       = $_GET['state'] ?? '';
    unset($_SESSION['oauth_state'], $_SESSION['oauth_provider']);

    // Validate state parameter (CSRF protection)
    if (!$storedState || !$state || !hash_equals($storedState, $state)) {
        header('Location: /admin/login?error=oauth_failed', true, 302);
        exit;
    }

    // Provider returned an error
    if (isset($_GET['error']) || empty($_GET['code'])) {
        header('Location: /admin/login?error=oauth_failed', true, 302);
        exit;
    }

    try {
        $tokens = exchangeOAuthCode($provider, $_GET['code']);
        if (empty($tokens['access_token'])) {
            header('Location: /admin/login?error=oauth_failed', true, 302);
            exit;
        }

        $rawInfo  = fetchOAuthUserInfo($provider, $tokens['access_token']);
        $userInfo = normalizeUserInfo($provider, $rawInfo);

        if (empty($userInfo['email'])) {
            // Discord users may not have a verified email
            header('Location: /admin/login?error=oauth_failed', true, 302);
            exit;
        }

        $db           = getDb();
        $userId       = upsertUser($db, $provider, $userInfo);
        $sessionToken = createSession($db, $userId);

        // Deliver token via hash fragment — never sent to server in subsequent requests
        header('Location: /admin#token=' . urlencode($sessionToken), true, 302);
        exit;

    } catch (\Exception $e) {
        error_log('OAuth callback error: ' . $e->getMessage());
        header('Location: /admin/login?error=oauth_failed', true, 302);
        exit;
    }
}

/**
 * POST /api/auth/logout
 * Deletes the current session.
 */
function handleAuthLogout(): never
{
    requireAuth(); // validates token; exits 401 if invalid
    $token = getTokenFromHeader(); // token already validated above, safe to use directly

    if ($token) {
        getDb()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    }

    jsonResponse(['ok' => true]);
}

/**
 * GET /api/auth/me
 * Returns the authenticated user and their roles.
 */
function handleAuthMe(): never
{
    $user  = requireAuth();
    $db    = getDb();
    $roles = getUserRoles($db, $user['id']);

    jsonResponse([
        'id'           => $user['id'],
        'email'        => $user['email'],
        'display_name' => $user['display_name'],
        'avatar_url'   => $user['avatar_url'],
        'roles'        => $roles,
    ]);
}
