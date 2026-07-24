const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middlewares/auth');

router.post('/start', requireAuth(), chatController.startChat);
router.get('/:chatId', requireAuth(), chatController.getChat);
router.post('/:chatId/messages', requireAuth(), chatController.sendMessage);
router.delete('/:chatId', requireAuth(), chatController.deleteChat);
// Kullanıcıya ait tüm chatleri getir
router.get('/user/:userId', requireAuth(), chatController.getUserChats);

module.exports = router;
