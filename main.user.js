// ==UserScript==
// @name         sbi log美化
// @namespace    http://tampermonkey.net/
// @version      1.4
// @updateURL    https://raw.githubusercontent.com/Cerallin/sbi-log-beautifier/master/main.user.js
// @downloadURL  https://raw.githubusercontent.com/Cerallin/sbi-log-beautifier/master/main.user.js
// @description  跑团聊天记录渲染优化
// @author       Cerallin
// @match        *://sbi.imhi.me/archives/*/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const OPTIONS = {
        msgOpacity: 0.05,
        msgFontSize: '18px',
    };

    const PAGE_TYPES = {
        NO_LOG: -1,
        LOG_SKY: 1, // 天空邮局
        LOG_WALL: 2, // 华尔街骑士
    };

    // =========================
    // 根据文本特征判断是否是跑团log页面
    // 特征：
    // 1. 出现 "角色|玩家:" 格式超过20次
    // =========================
    function getPageType() {

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
        const skyMatchCount = Array.from(posts).reduce((sum, post) => {
            const text = post.textContent || '';
            const matches = text.match(/[^|\n\r]{1,40}\|[^:\n\r]{1,40}:/gm);
            if (matches) {
                return sum + matches.length;
            }
        }, 0);

        if (skyMatchCount >= 20) {
            return PAGE_TYPES.LOG_SKY;
        }

        // 匹配：
        // 时间 <角色|玩家>
        //
        // 示例：
        // 13:10:42 <利亚姆|清水>
        const wallMatchCount = Array.from(posts).reduce((sum, post) => {
            const text = post.textContent || '';
            const matches = text.match(/\d+:\d+:\d+\s+<[^|<>]{1,40}\|[^<>]{1,40}>/gm);
            if (matches) {
                return sum + matches.length;
            }
        }, 0);

        if (wallMatchCount >= 20) {
            return PAGE_TYPES.LOG_WALL;
        }

        // 都不是，返回非日志页
        return PAGE_TYPES.NO_LOG;
    }

    // 从 "rgb(...)" 或 "rgba(...)" 字符串解析出 [r,g,b,a]
    function parseRGBString(str) {
        if (!str) return null;
        const m = str.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]\s*([0-9.]+))?\s*\)/);
        if (!m) return null;
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] !== undefined ? parseFloat(m[4]) : 1];
    }

    // 给定任意 CSS 合法颜色，返回低透明度背景色和用于边框/文字的实色
    function getColors(colorInput) {
        const color = (colorInput || 'black').toString();

        const NAMED_COLOR_BG_MAP = {
            red: `rgba(255, 80, 80, ${OPTIONS.msgOpacity})`,
            green: `rgba(80, 200, 120, ${OPTIONS.msgOpacity})`,
            blue: `rgba(80, 120, 255, ${OPTIONS.msgOpacity})`,
            purple: `rgba(180, 100, 255, ${OPTIONS.msgOpacity})`,
            grey: `rgba(120, 120, 120, ${OPTIONS.msgOpacity})`,
            gray: `rgba(120, 120, 120, ${OPTIONS.msgOpacity})`,
            orange: `rgba(255, 165, 0, ${OPTIONS.msgOpacity})`,
            yellow: `rgba(255, 220, 0, ${OPTIONS.msgOpacity})`,
            pink: `rgba(255, 105, 180, ${OPTIONS.msgOpacity})`,
            cyan: `rgba(0, 180, 180, ${OPTIONS.msgOpacity})`,
            black: `rgba(0, 0, 0, ${OPTIONS.msgOpacity})`
        };

        // 优先使用命名映射（保留原有细节）
        const key = color.toLowerCase();
        if (NAMED_COLOR_BG_MAP[key]) {
            return { bgColor: NAMED_COLOR_BG_MAP[key], solidColor: key };
        }

        // 使用离屏元素让浏览器解析任意 CSS 颜色字符串
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.width = '1px';
        el.style.height = '1px';
        el.style.left = '-9999px';
        el.style.backgroundColor = color;
        document.body.appendChild(el);
        const computed = getComputedStyle(el).backgroundColor;
        document.body.removeChild(el);

        const rgba = parseRGBString(computed) || [0, 0, 0, 1];
        const r = rgba[0], g = rgba[1], b = rgba[2];

        const bgColor = `rgba(${r}, ${g}, ${b}, ${OPTIONS.msgOpacity})`;
        const solidColor = `rgb(${r}, ${g}, ${b})`;

        return { bgColor, solidColor };
    }

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
            font-size: ${OPTIONS.msgFontSize};

            transition: all 0.15s ease;
        }

        .trpg-name {
            flex: 0 0 120px;
            font-weight: bold;
            text-align: right;
            white-space: nowrap;
        }

        .trpg-text {
            flex: 1;
            word-break: break-word;
			text-align: justify;
        }

        .trpg-role {
            opacity: 0.85;
        }

        .trpg-player {
            opacity: 0.6;
            font-size: 0.75em;
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
    // 将一行原始文本解析为具有属性的消息结构体
    // =========================
    function parseMessage(rawText) {
        rawText = (rawText || '').trim();
        if (!rawText) return null;

        const message = {
            role: null,
            player: null,
            gm: null,
            text: '',
            isOoc: false,
            isSystem: false,
            original: rawText,
        };

        const firstColon = rawText.indexOf(':');
        if (firstColon !== -1) {
            const left = rawText.slice(0, firstColon).trim();
            const right = rawText.slice(firstColon + 1).trim();

            if (left.includes('|')) {
                const [role, player] = left.split('|').map(item => item.trim());
                message.role = role;
                message.player = player;
            } else {
                message.gm = left;
            }

            message.text = right;
            message.isOoc = right.startsWith('（') || right.startsWith('(');
            return message;
        }

        const wallMatch = rawText.match(/^\s*&lt;([^<>]{1,40})&gt;\s*([\s\S]*)$/);
        if (wallMatch) {
            const inner = wallMatch[1].trim();
            const body = wallMatch[2].trim();

            if (inner.includes('|')) {
                const [role, player] = inner.split('|').map(item => item.trim());
                message.role = role;
                message.player = player;
            } else {
                message.role = inner;
            }

            message.text = body;
            message.isOoc = message.text.startsWith('（') || message.text.startsWith('(');
            
            return message;
        }

        message.text = rawText;
        message.isSystem = true;

        return message;
    }

    // =========================
    // 单条消息渲染
    // =========================
    function renderMessage(message, color) {
        if (!message || !message.text) return '';

        color = (color || 'black').toLowerCase();

        const { bgColor, solidColor } = getColors(color);
        const background = bgColor || `rgba(0,0,0,${OPTIONS.msgOpacity})`;
        const borderColor = solidColor || color;

        let nameHTML = '';
        let extraClass = message.isOoc ? 'trpg-ooc' : '';

        if (message.role || message.player) {
            nameHTML = `
                <span class="trpg-role">
                    ${message.role || ''}
                </span>
                <span class="trpg-player">
                    ${message.player || ''}
                </span>
            `;
        } else if (message.gm) {
            nameHTML = `
                <span class="trpg-gm">
                    ${message.gm}
                </span>
            `;
        }

        const textHTML = message.text
            .replace(/\n/g, '<br>');

        return `
            <div
                class="trpg-msg ${extraClass}"
                style="
                    background:${background};
                    border-left:4px solid ${borderColor};
                "
            >
                <div
                    class="trpg-name"
                    style="color:${borderColor}"
                >
                    ${nameHTML}
                </div>

                <div
                    class="trpg-text"
                    ${(extraClass == '') ? '' : `style="color:${solidColor};"`}
                >
                    ${textHTML}
                </div>
            </div>
        `;
    }

    // =========================
    // 获取p标签下所有的内容，有以下几种
    // 1. span包裹的消息行
    // 2. 纯文本行（备注、分团信息等）
    // 3. 图片
    // =========================
    function splitPByTopLevelBr(p) {
        const groups = [];
        let current = [];

        if (!p || !p.childNodes) return groups;

        // 只在顶层进行分割，嵌套的br不处理
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

    // =========================
    // 批量处理
    // =========================
    function processSkyPosts() {
        const posts = document.querySelectorAll('.post__content > p');

        posts.forEach(post => {
            if (post.dataset.trpgBeautified) return;
            post.dataset.trpgBeautified = '1';

            // 一次性替换
            let html = "";
            const groups = splitPByTopLevelBr(post);
            groups.forEach(nodes => {
                nodes.forEach(node => {
                    if (node.tagName === 'IMG') {
                        // 如果是图片直接显示
                        html += node.outerHTML;
                        return;
                    }

                    // 保留原有的HTML结构（如斜体、粗体等），所以使用innerHTML
                    const rawText = node.innerHTML || '';
                    const message = parseMessage(rawText);
                    const color = node.style && node.style.color || 'black';

                    if (message) {
                        html += renderMessage(message, color);
                    }
                });
            });

            post.innerHTML = html;

        });
    }

    function processWallPosts() {
        const divs = document.querySelectorAll('.post__content > div');

        divs.forEach(div => {
            if (div.dataset.trpgBeautified) return;
            div.dataset.trpgBeautified = '1';

            let html = "";
            const groups = splitPByTopLevelBr(div);
            groups.forEach(nodes => {
                nodes.forEach(node => {
                    if (node.tagName === 'IMG') {
                        // 如果是图片直接显示
                        html += node.outerHTML;
                        return;
                    }

                    // 保留原有的HTML结构（如斜体、粗体等），所以使用innerHTML
                    const rawText = node.innerHTML || '';
                    // 如果只是纯时间，忽略
                    if (rawText.match(/^\s*\d{1,2}:\d{2}:\d{2}\s*$/)) {
                        return;
                    }
                    const message = parseMessage(rawText);
                    const color = node.style && node.style.color || 'black';

                    if (message) {
                        html += renderMessage(message, color);
                    }
                });
            });

            div.innerHTML = html;
        });
    }

    // =========================
    // 执行入口 Start entry
    // =========================
    const pageType = getPageType();
    console.debug('Detected page type:', pageType);
    switch (pageType) {
        case PAGE_TYPES.LOG_SKY:
            processSkyPosts();
            break;
        case PAGE_TYPES.LOG_WALL:
            processWallPosts();
            break;
        default:
            return;
    }

    // =========================
    // 防抖 observer
    // =========================
    let timer = null;

    const observer = new MutationObserver(() => {

        clearTimeout(timer);

        timer = setTimeout(() => {
            processSkyPosts();
        }, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
