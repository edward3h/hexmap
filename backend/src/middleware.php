<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

/**
 * Extract the Bearer token string from the Authorization header.
 * Returns null if the header is absent or malformed.
 */
function getTokenFromHeader(): ?string
{
    $headers    = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        return trim($m[1]);
    }
    return null;
}

/**
 * Validate Bearer token from Authorization header.
 * Calls jsonResponse(401) and exits on failure.
 * Updates last_used_at + extends expiry on success (sliding window).
 *
 * @return array{id: int, email: string, display_name: string, avatar_url: string|null}
 */
function requireAuth(): array
{
    $token = getTokenFromHeader();
    if (!$token) {
        jsonResponse(['error' => 'Unauthorised'], 401);
    }
    $db    = getDb();

    $stmt = $db->prepare(
        'SELECT u.id, u.email, u.display_name, u.avatar_url
           FROM sessions s
           JOIN users u ON s.user_id = u.id
          WHERE s.token = ?
            AND s.expires_at > NOW()'
    );
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(['error' => 'Unauthorised'], 401);
    }

    // Slide the session window
    $db->prepare(
        'UPDATE sessions SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE token = ?'
    )->execute([$token]);

    $user['id'] = (int)$user['id'];
    return $user;
}

/**
 * Fetch all roles for a user.
 *
 * @return array<array{role_type: string, campaign_id: int, team_id: int}>
 */
function getUserRoles(PDO $db, int $userId): array
{
    $stmt = $db->prepare('SELECT role_type, campaign_id, team_id FROM user_roles WHERE user_id = ?');
    $stmt->execute([$userId]);
    return array_map(function (array $r): array {
        return [
            'role_type'   => $r['role_type'],
            'campaign_id' => (int)$r['campaign_id'],
            'team_id'     => (int)$r['team_id'],
        ];
    }, $stmt->fetchAll());
}

function isSuperuser(array $roles): bool
{
    foreach ($roles as $role) {
        if ($role['role_type'] === 'superuser') return true;
    }
    return false;
}

function isGmForCampaign(array $roles, int $campaignId): bool
{
    foreach ($roles as $role) {
        if ($role['role_type'] === 'superuser') return true;
        if ($role['role_type'] === 'gm' && $role['campaign_id'] === $campaignId) return true;
    }
    return false;
}

function isPlayerForCampaign(array $roles, int $campaignId): bool
{
    return getPlayerTeam($roles, $campaignId) !== null;
}

/**
 * Returns the team_id the player is assigned to in this campaign, or null.
 */
function getPlayerTeam(array $roles, int $campaignId): ?int
{
    foreach ($roles as $role) {
        if ($role['role_type'] === 'player' && $role['campaign_id'] === $campaignId) {
            return $role['team_id'];
        }
    }
    return null;
}

/** Exits with 403 if caller is not GM (or superuser) for the campaign. */
function requireGm(array $user, int $campaignId): void
{
    $roles = getUserRoles(getDb(), $user['id']);
    if (!isGmForCampaign($roles, $campaignId)) {
        jsonResponse(['error' => 'Forbidden'], 403);
    }
}

/** Exits with 403 if caller is not a superuser. */
function requireSuperuser(array $user): void
{
    $roles = getUserRoles(getDb(), $user['id']);
    if (!isSuperuser($roles)) {
        jsonResponse(['error' => 'Forbidden'], 403);
    }
}
