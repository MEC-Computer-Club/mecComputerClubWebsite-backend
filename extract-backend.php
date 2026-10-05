<?php
/**
 * MEC Computer Club — Automatic Deployment Extractor (Backend)
 * 
 * Usage:
 * Place this file inside `/home/meccompu/public_html/extract-backend.php`
 * 
 * When called via HTTP:
 * https://meccomputerclub.org/extract-backend.php?secret=YOUR_SECRET
 * It extracts `/home/meccompu/apps/backend/build.zip` into `/home/meccompu/apps/backend/`,
 * deletes the zip archive, and touches `tmp/restart.txt` to trigger Node.js app reload.
 */

header('Content-Type: application/json; charset=utf-8');

$secret = $_GET['secret'] ?? $_POST['secret'] ?? '';
$expectedSecret = getenv('DEPLOY_SECRET') ?: 'mec_cc_deploy_secret_2026';

if ($secret !== $expectedSecret) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid secret token']);
    exit;
}

$appDir = '/home/meccompu/apps/backend';
$zipFile = $appDir . '/build.zip';

if (!file_exists($zipFile)) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error' => 'build.zip not found in ' . $appDir,
        'checkedPath' => $zipFile
    ]);
    exit;
}

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'PHP ZipArchive extension is not enabled in cPanel PHP Selector']);
    exit;
}

$zip = new ZipArchive();
$openResult = $zip->open($zipFile);

if ($openResult === TRUE) {
    $zip->extractTo($appDir);
    $zip->close();
    
    // Clean up archive
    @unlink($zipFile);
    
    // Trigger Phusion Passenger application reload
    $tmpDir = $appDir . '/tmp';
    if (!is_dir($tmpDir)) {
        @mkdir($tmpDir, 0755, true);
    }
    @touch($tmpDir . '/restart.txt');

    echo json_encode([
        'success' => true,
        'message' => 'Backend build.zip extracted successfully and Passenger app reloaded.',
        'timestamp' => time()
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to extract archive. ZipArchive error code: ' . $openResult
    ]);
}
