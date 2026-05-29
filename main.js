// ==UserScript==
// @name         sbi log美化
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  跑团聊天记录渲染优化
// @author       Cerallin
// @match        *://sbi.imhi.me/archives/*/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================
    // 根据文本特征判断是否是跑团log页面
    // 特征：
    // 1. 出现 "角色|玩家:" 格式超过20次
    // =========================
    function isLogPage() {

        const posts =
              document.querySelectorAll('.post__content');

        if (!posts.length) {
            return false;
        }

        // 匹配：
        // 角色|玩家:
        //
        // 示例：
        // 阿尔托莉雅|津美:
        // KP|主持人:
        //
        // 不允许换行
        const LOG_REGEX =
              /[^|\n\r]{1,40}\|[^:\n\r]{1,40}:/gm;

        let matchCount = 0;

        posts.forEach(post => {

            // textContent 比 innerText 快
            const text =
                  post.textContent || '';

            const matches =
                  text.match(LOG_REGEX);

            if (matches) {
                matchCount += matches.length;
            }
        });

        return (matchCount >= 20);
    }

    if (!isLogPage()) {
        return;
    }


    // =========================
    // 颜色映射
    // =========================
    const COLOR_BG_MAP = {
        red: 'rgba(255, 80, 80, 0.10)',
        green: 'rgba(80, 200, 120, 0.10)',
        blue: 'rgba(80, 120, 255, 0.10)',
        purple: 'rgba(180, 100, 255, 0.10)',
        grey: 'rgba(120, 120, 120, 0.10)',
        gray: 'rgba(120, 120, 120, 0.10)',
        orange: 'rgba(255, 165, 0, 0.10)',
        yellow: 'rgba(255, 220, 0, 0.10)',
        pink: 'rgba(255, 105, 180, 0.10)',
        cyan: 'rgba(0, 180, 180, 0.10)',
        black: 'rgba(0, 0, 0, 0.06)'
    };

    // =========================
    // CSS
    // =========================
    const style = document.createElement('style');

    style.textContent = `
        .trpg-msg {
            display: flex;
            align-items: flex-start;
            gap: 30px;

            margin: 6px 0;
            padding: 8px 10px;

            border-radius: 10px;
            line-height: 1.6;
            font-size: 18px;

            transition: all 0.15s ease;
        }

        // FIXME 先不要hover动画
        // .trpg-msg:hover {
        //     transform: translateX(2px);
        // }

        .trpg-name {
            flex: 0 0 120px;
            font-weight: bold;
            text-align: right;
            white-space: nowrap;
        }

        .trpg-text {
            flex: 1;
            word-break: break-word;
        }

        .trpg-role {
            opacity: 0.85;
        }

        .trpg-player {
            opacity: 0.6;
            font-size: 12px;
            margin-left: 4px;
        }

        .trpg-gm {
            font-weight: bold;
        }

        .trpg-ooc .trpg-text {
            opacity: 0.72;
        }

        .trpg-ooc {
            background: rgba(255,255,255,0.03) !important;
        }
    `;

    document.head.appendChild(style);

    // =========================
    // 单条消息渲染
    // =========================
    function renderMessage(rawText, color) {

        rawText = rawText.trim();

        if (!rawText) return '';

        color = (color || 'black').toLowerCase();

        const bgColor =
              COLOR_BG_MAP[color] ||
              'rgba(0,0,0,0.05)';

        let nameHTML = '';
        let textHTML = '';
        let extraClass = '';

        const firstColon = rawText.indexOf(':');
        const hasColon = (firstColon !== -1);

        if (hasColon) {

            const left = rawText.slice(0, firstColon).trim();
            const right = rawText.slice(firstColon + 1).trim();

            // PC
            if (left.includes('|')) {

                const [role, player] = left.split('|');

                nameHTML = `
                    <span class="trpg-role">
                        ${role}
                    </span>
                    <span class="trpg-player">
                        ${player}
                    </span>
                `;

            } else {
                // GM
                nameHTML = `
                    <span class="trpg-gm">
                        ${left}
                    </span>
                `;
            }

            // OOC讨论
            if (
                right.startsWith('（') ||
                right.startsWith('(')
            ) {
                extraClass = 'trpg-ooc';
            }

            textHTML = right
                .replace(/\n/g, '<br>');

        } else {
            textHTML = rawText
                .replace(/\n/g, '<br>');
        }

        return `
            <div
                class="trpg-msg ${extraClass}"
                style="
                    background:${bgColor};
                    border-left:4px solid ${color};
                "
            >
                <div
                    class="trpg-name"
                    style="color:${color}"
                >
                    ${nameHTML}
                </div>

                <div class="trpg-text">
                    ${textHTML}
                </div>
            </div>
        `;
    }

    // =========================
    // 获取p标签下所有的内容
    // 基本上都是span包裹的东西，但也要兼顾纯文本行的备注和分团等信息
    // =========================
    function splitPByTopLevelBr(p) {
        const groups = [];
        let current = [];

        p.childNodes.forEach(node => {

            // 顶层 BR -> 分段
            if (
                node.nodeType === Node.ELEMENT_NODE &&
                node.tagName === 'BR'
            ) {

                if (current.length) {
                    groups.push(current);
                    current = [];
                }

                return;
            }

            current.push(node);
        });

        if (current.length) {
            groups.push(current);
        }

        return groups;
    }

    function processP(post) {
        let html = "";

        const groups = splitPByTopLevelBr(post);

        groups.forEach(nodes => {

            // 临时容器
            const temp = document.createElement('div');

            nodes.forEach(node => {
                temp.appendChild(node.cloneNode(true));
            });

            const span = temp.querySelector(':scope > span');

            // 有span -> 普通消息
            if (span) {

                html += renderMessage(
                    span.innerHTML,
                    span.style.color || 'black',
                    false
                );

            } else {

                // 无span -> system备注
                html += renderMessage(
                    temp.textContent || '',
                    'gray',
                    true
                );
            }
        });

        return html;
    }

    // =========================
    // 批量处理
    // =========================
    function processPosts() {

        const posts =
              document.querySelectorAll('.post__content > p');

        posts.forEach(post => {

            if (post.dataset.trpgBeautified) return;

            post.dataset.trpgBeautified = '1';


            // 一次性替换
            post.innerHTML = processP(post);
        });
    }

    // =========================
    // 首次执行
    // =========================
    processPosts();

    // =========================
    // 防抖 observer
    // =========================
    let timer = null;

    const observer = new MutationObserver(() => {

        clearTimeout(timer);

        timer = setTimeout(() => {
            processPosts();
        }, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
