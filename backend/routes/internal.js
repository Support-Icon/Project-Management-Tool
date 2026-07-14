const express = require('express');
const { runDueDigests } = require('../jobs/runDigest');

const router = express.Router();

router.post('/digest', async (req, res) => {
  try {
    const secret = req.header('X-Cron-Secret');
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ message: 'Invalid cron secret' });
    }
    const results = await runDueDigests();
    res.json({ checkedAt: new Date(), results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
