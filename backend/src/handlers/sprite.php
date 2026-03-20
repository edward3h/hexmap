<?php
// backend/src/handlers/sprite.php
// Sprite upload and history management for teams.

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';

const SPRITE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const SPRITE_ACCEPTED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const SPRITE_UPLOAD_DIR = __DIR__ . '/../../public/sprites/';

/**
 * Verify team belongs to campaign. Exits 404 if not found.
 */
function requireTeamInCampaign(PDO $db, int $campaignId, int $teamId): void
{
    $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$teamId, $campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Team not found in this campaign'], 404);
    }
}

/**
 * GET /api/campaigns/:campaignId/teams/:teamId/sprites
 * List sprite history for a team (ordered newest first).
 * Requires GM or superuser.
 */
function handleListSprites(int $campaignId, int $teamId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();
    requireTeamInCampaign($db, $campaignId, $teamId);

    $stmt = $db->prepare(
        'SELECT id, sprite_url, sprite_width, sprite_height, uploaded_at
           FROM team_sprite_history
          WHERE team_id = ?
          ORDER BY uploaded_at DESC'
    );
    $stmt->execute([$teamId]);
    $rows = $stmt->fetchAll();

    $result = array_map(function (array $r): array {
        return [
            'id'            => (int)$r['id'],
            'sprite_url'    => $r['sprite_url'],
            'sprite_width'  => (int)$r['sprite_width'],
            'sprite_height' => (int)$r['sprite_height'],
            'uploaded_at'   => $r['uploaded_at'],
        ];
    }, $rows);

    jsonResponse($result);
}

/**
 * POST /api/campaigns/:campaignId/teams/:teamId/sprites
 * Upload a new sprite image (multipart/form-data, field: "sprite").
 * Requires GM or superuser.
 * Returns: 201 { "ok": true }
 */
function handleUploadSprite(int $campaignId, int $teamId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();
    requireTeamInCampaign($db, $campaignId, $teamId);

    if (!isset($_FILES['sprite']) || $_FILES['sprite']['error'] !== UPLOAD_ERR_OK) {
        $err = $_FILES['sprite']['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($err === UPLOAD_ERR_NO_FILE) {
            jsonResponse(['error' => 'No file uploaded'], 400);
        }
        jsonResponse(['error' => 'Upload error: ' . $err], 400);
    }

    $file = $_FILES['sprite'];

    if ($file['size'] > SPRITE_MAX_BYTES) {
        jsonResponse(['error' => 'File exceeds 2 MB limit'], 400);
    }

    $info = @getimagesize($file['tmp_name']);
    if ($info === false) {
        jsonResponse(['error' => 'Could not detect image dimensions'], 400);
    }

    $mime = $info['mime'];
    if (!in_array($mime, SPRITE_ACCEPTED_MIMES, true)) {
        jsonResponse(['error' => 'Unsupported image type: ' . $mime], 400);
    }

    $ext = match ($mime) {
        'image/png'  => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
        'image/gif'  => 'gif',
    };

    $width  = (int)$info[0];
    $height = (int)$info[1];

    $timestamp = time();
    $filename  = "{$campaignId}_{$teamId}_{$timestamp}.{$ext}";
    $destDir   = SPRITE_UPLOAD_DIR;

    if (!is_dir($destDir) && !mkdir($destDir, 0755, true)) {
        jsonResponse(['error' => 'Failed to create upload directory'], 500);
    }

    $destPath = $destDir . $filename;
    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        jsonResponse(['error' => 'Failed to save uploaded file'], 500);
    }

    $spriteUrl = 'sprites/' . $filename;

    $db->beginTransaction();
    try {
        $db->prepare(
            'INSERT INTO team_sprite_history (team_id, sprite_url, sprite_width, sprite_height) VALUES (?, ?, ?, ?)'
        )->execute([$teamId, $spriteUrl, $width, $height]);

        $db->prepare(
            'UPDATE teams SET sprite_url = ?, sprite_width = ?, sprite_height = ? WHERE id = ?'
        )->execute([$spriteUrl, $width, $height, $teamId]);

        $db->commit();
    } catch (\Throwable $e) {
        $db->rollBack();
        @unlink($destPath);
        throw $e;
    }

    jsonResponse(['ok' => true], 201);
}

/**
 * POST /api/campaigns/:campaignId/teams/:teamId/sprites/:spriteId/activate
 * Set a history entry as the active sprite for the team.
 * Requires GM or superuser.
 * Returns: 200 { "ok": true }
 */
function handleActivateSprite(int $campaignId, int $teamId, int $spriteId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();
    requireTeamInCampaign($db, $campaignId, $teamId);

    $stmt = $db->prepare(
        'SELECT id, sprite_url, sprite_width, sprite_height
           FROM team_sprite_history
          WHERE id = ? AND team_id = ?'
    );
    $stmt->execute([$spriteId, $teamId]);
    $history = $stmt->fetch();

    if (!$history) {
        jsonResponse(['error' => 'Sprite history entry not found for this team'], 404);
    }

    $db->prepare(
        'UPDATE teams SET sprite_url = ?, sprite_width = ?, sprite_height = ? WHERE id = ?'
    )->execute([$history['sprite_url'], (int)$history['sprite_width'], (int)$history['sprite_height'], $teamId]);

    jsonResponse(['ok' => true]);
}

/**
 * DELETE /api/campaigns/:campaignId/teams/:teamId/sprite
 * Deassign the active sprite (set to NULL). History is retained.
 * Requires GM or superuser.
 * Returns: 200 { "ok": true }
 */
function handleDeassignSprite(int $campaignId, int $teamId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();
    requireTeamInCampaign($db, $campaignId, $teamId);

    $db->prepare(
        'UPDATE teams SET sprite_url = NULL, sprite_width = NULL, sprite_height = NULL WHERE id = ?'
    )->execute([$teamId]);

    jsonResponse(['ok' => true]);
}
