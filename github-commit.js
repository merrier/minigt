#!/usr/bin/env node
/**
 * GitHub Auto Commit - 爬取完成后自动提交到 GitHub
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_DIR = "/root/.openclaw/workspace/data";
const OUTPUT_FILE = path.join(DATA_DIR, "minigt-products.json");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const TOKEN = "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";  // 从 TOOLS.md 获取
const REPO_OWNER = "";  // TODO: 用户需要填写
const REPO_NAME = "";   // TODO: 用户需要填写
const COMMITTER_NAME = "点点";
const COMMITTER_EMAIL = "diandian@openclaw.local";

function runGit(cmd) {
    console.log(`执行: ${cmd}`);
    try {
        return execSync(cmd, { cwd: '/root/.openclaw/workspace', encoding: 'utf8' });
    } catch (e) {
        console.log(`Git 输出: ${e.stdout}`);
        console.log(`Git 错误: ${e.stderr}`);
        return null;
    }
}

function checkForNewData() {
    // 检查数据文件是否存在
    if (!fs.existsSync(OUTPUT_FILE)) {
        console.log("数据文件不存在，等待爬虫完成...");
        return false;
    }
    
    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`数据文件包含 ${data.length} 个商品`);
    
    return data.length > 0;
}

async function commitToGitHub() {
    console.log("\n=== 开始提交到 GitHub ===");
    
    // 配置 git
    runGit(`git config --global user.name "${COMMITTER_NAME}"`);
    runGit(`git config --global user.email "${COMMITTER_EMAIL}"`);
    runGit(`git config --global credential.helper store`);
    
    // 添加远程仓库（如果需要）
    if (REPO_OWNER && REPO_NAME) {
        const remoteUrl = `https://${TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
        runGit(`git remote add origin ${remoteUrl} 2>/dev/null || true`);
    }
    
    // 添加文件
    runGit('git add data/');
    
    // 检查是否有变化
    const status = runGit('git status --short');
    if (!status || status.trim() === '') {
        console.log("没有新数据需要提交");
        return;
    }
    
    // 提交
    const date = new Date().toISOString().slice(0, 10);
    runGit(`git commit -m "Update MINI GT products - ${date}"`);
    
    // 推送到 GitHub（如果配置了仓库）
    if (REPO_OWNER && REPO_NAME) {
        console.log("推送到 GitHub...");
        runGit('git push origin main || git push origin master');
    } else {
        console.log("⚠️ 未配置 GitHub 仓库，请设置 REPO_OWNER 和 REPO_NAME");
    }
}

async function main() {
    // 等待数据
    let retries = 0;
    while (!checkForNewData() && retries < 30) {
        await new Promise(r => setTimeout(r, 60000)); // 每分钟检查一次
        retries++;
    }
    
    // 提交
    await commitToGitHub();
}

main().catch(console.error);