const express = require('express');
const router = express.Router();
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'your_jwt_secret_key'; // JWT 서명용 비밀키 (임시)

// 회원가입 API
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json'));

  if (users.find(user => user.email === email)) {
    return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ email, password: hashedPassword });
  fs.writeFileSync('users.json', JSON.stringify(users));

  res.json({ message: '회원가입 성공' });
});

// 로그인 API
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json'));
  const user = users.find(user => user.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 잘못되었습니다.' });
  }

  const token = jwt.sign({ email: user.email }, SECRET_KEY, { expiresIn: '1h' });
  res.json({ token });
});

router.delete('/patient/notes/:id', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, 'YOUR_SECRET_KEY', (err, user) => { // 'YOUR_SECRET_KEY'는 실제 키로 변경하세요.
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }

    const noteIdToDelete = req.params.id;
    const userId = user.id;

    // DB에서 해당 사용자의 메모가 맞는지 확인 후 삭제
    db.run('DELETE FROM notes WHERE id = ? AND user_id = ?', [noteIdToDelete, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: '데이터베이스 오류로 메모를 삭제하지 못했습니다.' });
      }
      // this.changes는 sqlite3에서 변경된 행의 수를 나타냅니다.
      if (this.changes === 0) {
        return res.status(404).json({ error: '메모를 찾을 수 없거나 삭제할 권한이 없습니다.' });
      }
      res.status(200).json({ message: '메모가 성공적으로 삭제되었습니다.' });
    });
  });
});

module.exports = router;