// ==UserScript==
// @name         sbi log美化
// @namespace    http://tampermonkey.net/
// @version      1.5
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

    // 日志格式配置
    const LOG_FORMAT_CONFIG = {
        [PAGE_TYPES.LOG_SKY]: {
            name: 'SKY',
            contentSelector: '.post__content > p',
            detectionPattern: /[^|\n\r]{1,40}\|[^:\n\r]{1,40}:/gm,
            detectionThreshold: 20,
            skipCondition: null,
        },
        [PAGE_TYPES.LOG_WALL]: {
            name: 'WALL',
            contentSelector: '.post__content > div',
            detectionPattern: /\d+:\d+:\d+\s+<[^|<>]{1,40}\|[^<>]{1,40}>/gm,
            detectionThreshold: 20,
            skipCondition: (rawText) => rawText.match(/^\s*\d{1,2}:\d{2}:\d{2}\s*$/),
        },
    };

    // =========================
    // 根据文本特征判断是否是跑团log页面
    // =========================
    function getPageType() {
        const posts = document.querySelectorAll('.post__content');

        if (!posts.length) {
            return PAGE_TYPES.NO_LOG;
        }

        for (const [pageType, config] of Object.entries(LOG_FORMAT_CONFIG)) {
            const matchCount = countMatches(posts, config.detectionPattern);
            if (matchCount >= config.detectionThreshold) {
                return parseInt(pageType);
            }
        }

        return PAGE_TYPES.NO_LOG;
    }

    // 统计所有帖子中匹配模式的总数
    function countMatches(posts, pattern) {
        return Array.from(posts).reduce((sum, post) => {
            const text = post.textContent || '';
            const matches = text.match(pattern);
            return sum + (matches ? matches.length : 0);
        }, 0);
    }

    // 从 "rgb(...)" 或 "rgba(...)" 字符串解析出 [r,g,b,a]
    function parseRGBString(str) {
        if (!str) return null;
        const m = str.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]\s*([0-9.]+))?\s*\)/);
        if (!m) return null;
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] !== undefined ? parseFloat(m[4]) : 1];
    }

    // 命名颜色映射表
    const NAMED_COLORS = {
        red: [255, 80, 80],
        green: [80, 200, 120],
        blue: [80, 120, 255],
        purple: [180, 100, 255],
        grey: [120, 120, 120],
        gray: [120, 120, 120],
        orange: [255, 165, 0],
        yellow: [255, 220, 0],
        pink: [255, 105, 180],
        cyan: [0, 180, 180],
        black: [0, 0, 0]
    };

    // 将 RGB 数组转换为 CSS 颜色字符串
    function rgbArrayToString(rgb, alpha) {
        const [r, g, b] = rgb;
        return alpha !== undefined ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
    }

    // 给定任意 CSS 合法颜色，返回低透明度背景色和用于边框/文字的实色
    function getColors(colorInput) {
        const color = (colorInput || 'black').toString().toLowerCase();
        let rgb = null;

        // 优先使用命名颜色映射
        if (NAMED_COLORS[color]) {
            rgb = NAMED_COLORS[color];
        } else {
            // 使用离屏元素让浏览器解析任意 CSS 颜色字符串
            rgb = parseColorWithElement(color);
        }

        const [r, g, b] = rgb;
        const bgColor = `rgba(${r}, ${g}, ${b}, ${OPTIONS.msgOpacity})`;
        const solidColor = `rgb(${r}, ${g}, ${b})`;

        return { bgColor, solidColor };
    }

    // 通过创建离屏元素解析 CSS 颜色
    function parseColorWithElement(color) {
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
        return rgba.slice(0, 3);
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

        // 尝试解析为冒号分割格式 (角色|玩家: 或 KP:)
        const colonParsed = parseColonFormat(rawText, message);
        if (colonParsed) return message;

        // 尝试解析为尖括号格式 <角色|玩家> (华尔街格式)
        const angleParsed = parseAngleBracketFormat(rawText, message);
        if (angleParsed) return message;

        // 其他格式作为系统消息处理
        message.text = rawText;
        message.isSystem = true;

        return message;
    }

    // 解析冒号分割格式：角色|玩家: 文本 或 KP: 文本
    function parseColonFormat(rawText, message) {
        const firstColon = rawText.indexOf(':');
        if (firstColon === -1) return false;

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
        message.isOoc = isOocText(right);
        return true;
    }

    // 解析尖括号格式：<角色|玩家> 文本
    function parseAngleBracketFormat(rawText, message) {
        const match = rawText.match(/^\s*&lt;([^<>]{1,40})&gt;\s*([\s\S]*)$/);
        if (!match) return false;

        const inner = match[1].trim();
        const body = match[2].trim();

        if (inner.includes('|')) {
            const [role, player] = inner.split('|').map(item => item.trim());
            message.role = role;
            message.player = player;
        } else {
            message.role = inner;
        }

        message.text = body;
        message.isOoc = isOocText(message.text);
        return true;
    }

    // 判断是否为 OOC 文本（括号开头）
    function isOocText(text) {
        return text.startsWith('（') || text.startsWith('(');
    }

    // =========================
    // 单条消息渲染
    // =========================
    function renderMessage(message, color) {
        if (!message || !message.text) return '';

        const { bgColor, solidColor } = getColors(color || 'black');
        const extraClass = message.isOoc ? 'trpg-ooc' : '';

        const nameHTML = buildNameHTML(message, solidColor);
        const textHTML = message.text.replace(/\n/g, '<br>');

        return `
            <div
                class="trpg-msg ${extraClass}"
                style="
                    background:${bgColor};
                    border-left:4px solid ${solidColor};
                "
            >
                <div
                    class="trpg-name"
                    style="color:${solidColor}"
                >
                    ${nameHTML}
                </div>

                <div
                    class="trpg-text"
                    ${extraClass === '' ? '' : `style="color:${solidColor};"`}
                >
                    ${textHTML}
                </div>
            </div>
        `;
    }

    // 构建名字区域 HTML
    function buildNameHTML(message, color) {
        if (message.role || message.player) {
            return `
                <span class="trpg-role">
                    ${message.role || ''}
                </span>
                <span class="trpg-player">
                    ${message.player || ''}
                </span>
            `;
        } else if (message.gm) {
            return `<span class="trpg-gm">${message.gm}</span>`;
        }
        return '';
    }

    // =========================
    // 获取容器下所有的内容分组
    // 在顶层 BR 处分割，保留其他结构
    // =========================
    function splitContainerByTopLevelBr(container) {
        const groups = [];
        let current = [];

        if (!container || !container.childNodes) return groups;

        container.childNodes.forEach(node => {
            // 顶层 BR -> 分段
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
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

    // 处理单个节点组
    function processNodeGroup(nodes, skipCondition) {
        let html = '';

        nodes.forEach(node => {
            if (node.tagName === 'IMG') {
                html += node.outerHTML;
                return;
            }

            const rawText = node.innerHTML || '';

            // 应用跳过条件（例如纯时间戳）
            if (skipCondition && skipCondition(rawText)) {
                return;
            }

            const message = parseMessage(rawText);
            const color = node.style?.color || 'black';

            if (message) {
                html += renderMessage(message, color);
            }
        });

        return html;
    }

    // =========================
    // 统一处理函数 - 适用于所有日志格式
    // =========================
    function processPosts(pageType) {
        const config = LOG_FORMAT_CONFIG[pageType];
        if (!config) return;

        const containers = document.querySelectorAll(config.contentSelector);

        containers.forEach(container => {
            if (container.dataset.trpgBeautified) return;
            container.dataset.trpgBeautified = '1';

            let html = '';
            const groups = splitContainerByTopLevelBr(container);
            groups.forEach(nodes => {
                html += processNodeGroup(nodes, config.skipCondition);
            });

            container.innerHTML = html;
        });
    }

    // =========================
    // 执行入口 Start entry
    // =========================
    const pageType = getPageType();
    console.debug('Detected page type:', pageType);

    if (pageType === PAGE_TYPES.NO_LOG) {
        console.debug('Not a log page, exiting');
        return;
    }

    // 初始化处理
    processPosts(pageType);

    // =========================
    // 防抖 observer - 监听动态内容更新
    // =========================
    let timer = null;

    const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            processPosts(pageType);
        }, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
