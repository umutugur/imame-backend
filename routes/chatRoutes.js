const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.post('/start', chatController.startChat);
router.get('/:chatId', chatController.getChat);
router.post('/:chatId/messages', chatController.sendMessage);
router.delete('/:chatId', chatController.deleteChat);

module.exports = router;
