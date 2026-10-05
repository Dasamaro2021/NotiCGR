<?php
declare(strict_types=1);
/* NotiCGR – API (PHP 8+ con pdo_sqlite). Crea sola la base de datos en data/ y guarda los PDF en uploads/. */
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const MAX_PDF = 2 * 1024 * 1024;
const CATS = ['General', 'Política', 'Economía', 'Justicia', 'Regional', 'Tecnología'];
function out($d, int $c = 200) { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $m, int $c = 400) { out(['error' => $m], $c); }
function clean(array $in): array {
    $t = trim((string)($in['text'] ?? '')); $c = (string)($in['cat'] ?? '');
    if ($t === '' || mb_strlen($t) > 500) fail('El texto debe tener entre 1 y 500 caracteres.');
    if (!in_array($c, CATS, true)) fail('Categoría no válida.');
    return [$t, $c];
}
function mine(PDO $db, $uid, $id) {
    $s = $db->prepare('SELECT id,user_id,file FROM posts WHERE id=?'); $s->execute([(int)$id]); $p = $s->fetch();
    if (!$p) fail('La noticia no existe.', 404);
    if ((int)$p['user_id'] !== (int)$uid) fail('No puedes modificar esta noticia.', 403);
    return $p;
}

try {
    $dir = __DIR__ . '/data'; @mkdir($dir, 0750); @mkdir(__DIR__ . '/uploads', 0755);
    if (!file_exists("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\n");
    $db = new PDO('sqlite:' . $dir . '/noticgr.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA foreign_keys=ON');
    $db->exec("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE NOT NULL, pass TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, cat TEXT NOT NULL, file TEXT, file_name TEXT, file_size INTEGER, created INTEGER NOT NULL, edited INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS likes(user_id INTEGER, post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(user_id,post_id));
      CREATE TABLE IF NOT EXISTS saves(user_id INTEGER, post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(user_id,post_id));");
    if (!$db->query('SELECT 1 FROM posts LIMIT 1')->fetch())
        $db->prepare('INSERT INTO posts(user_id,text,cat,created) VALUES(NULL,?,?,?)')->execute(['Bienvenidos a NotiCGR. Crea una cuenta para publicar, adjuntar un PDF de una hoja y filtrar por tema. #Bienvenida', 'General', time()]);

    $a = $_GET['a'] ?? '';
    $isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
    if ($isPost && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') fail('Solicitud no válida.', 403);
    $in = $isPost ? (json_decode(file_get_contents('php://input'), true) ?: $_POST) : [];
    $uid = $_SESSION['uid'] ?? null;

    if ($a === 'me') {
        $n = null;
        if ($uid) { $s = $db->prepare('SELECT name FROM users WHERE id=?'); $s->execute([$uid]); $n = $s->fetchColumn() ?: null; }
        out(['user' => $n]);
    }
    if ($a === 'posts') {
        $s = $db->prepare("SELECT p.*, COALESCE(u.name,'Redacción') author,
            (SELECT COUNT(*) FROM likes WHERE post_id=p.id) likes,
            EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) liked,
            EXISTS(SELECT 1 FROM saves WHERE post_id=p.id AND user_id=?) saved
            FROM posts p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created DESC, p.id DESC LIMIT 300");
        $u = (int)$uid; $s->execute([$u, $u]);
        out(array_map(fn($r) => [
            'id' => (int)$r['id'], 'text' => $r['text'], 'cat' => $r['cat'], 'author' => $r['author'],
            't' => (int)$r['created'] * 1000, 'likes' => (int)$r['likes'], 'liked' => (bool)$r['liked'], 'saved' => (bool)$r['saved'], 'edited' => (bool)$r['edited'],
            'file' => $r['file'] ? ['name' => $r['file_name'], 'size' => (int)$r['file_size'], 'url' => 'uploads/' . $r['file']] : null,
        ], $s->fetchAll()));
    }
    if (!$isPost) fail('Acción desconocida.', 404);

    if ($a === 'register') {
        $n = trim((string)($in['u'] ?? '')); $p = (string)($in['p'] ?? '');
        if (!preg_match('/^[\p{L}\d_.]{3,20}$/u', $n)) fail('El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.');
        if (strlen($p) < 6 || strlen($p) > 200) fail('La contraseña debe tener al menos 6 caracteres.');
        try { $db->prepare('INSERT INTO users(name,pass,created) VALUES(?,?,?)')->execute([$n, password_hash($p, PASSWORD_DEFAULT), time()]); }
        catch (PDOException $e) { fail('Ese nombre de usuario ya está en uso.', 409); }
        session_regenerate_id(true); $_SESSION['uid'] = (int)$db->lastInsertId(); out(['user' => $n]);
    }
    if ($a === 'login') {
        $s = $db->prepare('SELECT id,name,pass FROM users WHERE name=?'); $s->execute([trim((string)($in['u'] ?? ''))]); $r = $s->fetch();
        if (!$r || !password_verify((string)($in['p'] ?? ''), $r['pass'])) { usleep(600000); fail('Usuario o contraseña incorrectos.', 401); }
        session_regenerate_id(true); $_SESSION['uid'] = (int)$r['id']; out(['user' => $r['name']]);
    }
    if ($a === 'logout') { $_SESSION = []; session_destroy(); out(['ok' => true]); }

    if (!$uid) fail('Inicia sesión para continuar.', 401);

    if ($a === 'create') {
        [$t, $c] = clean($in); $file = $fn = $fs = null;
        if (!empty($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
            $f = $_FILES['file'];
            if ($f['error'] !== UPLOAD_ERR_OK) fail('No se pudo subir el PDF.');
            if ($f['size'] > MAX_PDF) fail('El PDF pesa más de 2 MB.');
            $raw = file_get_contents($f['tmp_name']);
            if (substr($raw, 0, 5) !== '%PDF-' || (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) !== 'application/pdf') fail('Solo se aceptan archivos PDF.');
            if (preg_match_all('~/Type\s*/Page(?![s\w])~', $raw) > 1) fail('El PDF debe tener una sola hoja.');
            $file = bin2hex(random_bytes(16)) . '.pdf';
            move_uploaded_file($f['tmp_name'], __DIR__ . "/uploads/$file") || fail('No se pudo guardar el PDF.', 500);
            $fn = mb_substr(basename($f['name']), 0, 80); $fs = (int)$f['size'];
        }
        $db->prepare('INSERT INTO posts(user_id,text,cat,file,file_name,file_size,created) VALUES(?,?,?,?,?,?,?)')->execute([$uid, $t, $c, $file, $fn, $fs, time()]);
        out(['id' => (int)$db->lastInsertId()]);
    }
    if ($a === 'update') {
        $p = mine($db, $uid, $in['id'] ?? 0); [$t, $c] = clean($in);
        if (!empty($in['rmfile']) && $p['file']) { @unlink(__DIR__ . '/uploads/' . $p['file']); $db->prepare('UPDATE posts SET file=NULL,file_name=NULL,file_size=NULL WHERE id=?')->execute([$p['id']]); }
        $db->prepare('UPDATE posts SET text=?,cat=?,edited=1 WHERE id=?')->execute([$t, $c, $p['id']]);
        out(['ok' => true]);
    }
    if ($a === 'delete') {
        $p = mine($db, $uid, $in['id'] ?? 0);
        if ($p['file']) @unlink(__DIR__ . '/uploads/' . $p['file']);
        $db->prepare('DELETE FROM posts WHERE id=?')->execute([$p['id']]); out(['ok' => true]);
    }
    if ($a === 'like' || $a === 'save') {
        $tb = $a === 'like' ? 'likes' : 'saves'; $id = (int)($in['id'] ?? 0);
        $e = $db->prepare('SELECT 1 FROM posts WHERE id=?'); $e->execute([$id]);
        if (!$e->fetch()) fail('La noticia no existe.', 404);
        $d = $db->prepare("DELETE FROM $tb WHERE user_id=? AND post_id=?"); $d->execute([$uid, $id]);
        if (!$d->rowCount()) $db->prepare("INSERT INTO $tb(user_id,post_id) VALUES(?,?)")->execute([$uid, $id]);
        out(['ok' => true]);
    }
    fail('Acción desconocida.', 404);
} catch (Throwable $e) {
    fail('Error del servidor.', 500);
}
