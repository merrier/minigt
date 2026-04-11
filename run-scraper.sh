#!/bin/bash
# MINI GT Scraper 定时任务脚本
# 每天凌晨 3 点自动运行

cd /root/.openclaw/workspace

# 运行爬虫
echo "$(date) - 开始爬取..." >> scraper-cron.log
node minigt-scraper.js >> scraper-cron.log 2>&1

# 等待爬虫完成
sleep 5

# 提交到 GitHub
echo "$(date) - 开始提交..." >> scraper-cron.log
node github-commit.js >> scraper-cron.log 2>&1

echo "$(date) - 完成" >> scraper-cron.log