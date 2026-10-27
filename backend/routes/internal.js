const express = require('express');
const { runDueDigests } = require('../jobs/runDigest');
const { runDueDailyReports } = require('../jobs/runDailyReports');

const router = express.Router();

const requireCron = (req, res) => {
  const secret = req.header('X-Cron-Secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ message: 'Invalid cron secret' });
    return false;
  }
  return true;
};

router.post('/digest', async (req, res) => {
  try {
    if (!requireCron(req, res)) return;
    const results = await runDueDigests();
    res.json({ checkedAt: new Date(), results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/daily-report', async (req, res) => {
  try {
    if (!requireCron(req, res)) return;
    const results = await runDueDailyReports();
    res.json({ checkedAt: new Date(), results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
