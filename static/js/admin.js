/* ==========================================================
   員工體驗洞察平台
   Admin Application
   ========================================================== */


/* ==========================================================
   Global state
   ========================================================== */

let allFeedbackData = [];

let dataTableInstance = null;

let sentimentChartInstance = null;
let deptChartInstance = null;
let categoryChartInstance = null;
let trendChartInstance = null;


/*
    注意：
    theoryRussellChartInstance
    theoryWarrChartInstance
    theoryJdrProcessChartInstance
    theoryJdrEvidenceChartInstance

    已經由 _dashboard.html 負責宣告，
    這裡不能再次使用 let 宣告，
    否則整份 admin.js 會因重複宣告而停止執行。
*/


let isEditMode = false;

let editingRuleId = null;

let baseDashboardData = [];

function createEmptyGlobalFilters() {

    return {
        department: null,
        category: null,
        startDate: null,
        endDate: null
    };

}


function createEmptyOverviewFilters() {

    return {
        sentiment: null
    };

}


function createEmptyAffectFilters() {

    return {
        affectiveState: null,

        quadrant: null,

        valenceMin: null,
        valenceMax: null,

        arousalMin: null,
        arousalMax: null,

        /*
         * 點 Russell Bubble 時，
         * 使用精確 Valence × Arousal。
         */
        valence: null,
        arousal: null
    };

}


function createEmptyJdrFilters() {

    return {
        process: null,
        evidence: null
    };

}


let globalFilters =
    createEmptyGlobalFilters();


let overviewFilters =
    createEmptyOverviewFilters();


let affectFilters =
    createEmptyAffectFilters();


let jdrFilters =
    createEmptyJdrFilters();


let globalDashboardData = [];


let lockedCharts = {
    sentiment: false,
    category: false,
    dept: false
};


/* ==========================================================
   Chart plugins
   ========================================================== */

if (
    typeof Chart !== 'undefined'

    &&

    typeof ChartDataLabels !== 'undefined'
) {

    Chart.register(
        ChartDataLabels
    );

}


/* ==========================================================
   Navigation
   ========================================================== */

function switchTab(
    target
) {

    const sections = [
        'table',
        'dashboard',
        'airules',
        'recycle'
    ];


    const pageMeta = {

        table: {
            title:
                '回饋管理',

            description:
                '查看、篩選與管理員工回饋及分析結果。'
        },

        dashboard: {
            title:
                '員工總覽與分析',

            description:
                '將團隊的聲音，轉化為更清晰的管理視角。'
        },

        airules: {
            title:
                '語意設定',

            description:
                '維護組織常用語意參考，協助系統理解企業內部語境。'
        },

        recycle: {
            title:
                '回收桶',

            description:
                '管理已刪除的回饋資料與復原作業。'
        }

    };


    sections.forEach(
        section => {

            const sectionEl =
                document.getElementById(
                    `section-${section}`
                );


            const navEl =
                document.getElementById(
                    `nav-${section}`
                );


            if (
                sectionEl
            ) {

                sectionEl.style.display =

                    section === target

                        ? 'block'

                        : 'none';

            }


            if (
                navEl
            ) {

                navEl.classList.toggle(
                    'active',
                    section === target
                );

            }

        }
    );


    document.getElementById('breadcrumb-current').textContent = pageMeta[target]?.title || '';
    document.getElementById('header-feedback-action').hidden = target === 'table';
    document.querySelectorAll('.sidebar-link').forEach(button => {
        if (button.id === `nav-${target}`) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });

    const meta =
        pageMeta[target]
        ||
        pageMeta.table;


    const titleEl =
        document.getElementById(
            'page-title'
        );


    const descriptionEl =
        document.getElementById(
            'page-description'
        );


    if (
        titleEl
    ) {

        titleEl.textContent =
            meta.title;

    }


    if (
        descriptionEl
    ) {

        descriptionEl.textContent =
            meta.description;

    }


    if (
        target === 'airules'
    ) {

        loadRules();

    }


    if (
        target === 'recycle'
    ) {

        loadRecycleBin();

    }


    if (
    target === 'dashboard'
) {

    /*
     * section-dashboard 剛從 display:none
     * 變成 display:block 時，
     * 給瀏覽器一個 frame 完成 layout。
     *
     * 第二個 requestAnimationFrame 時，
     * canvas 才能取得正確寬高。
     */
    requestAnimationFrame(
        () => {

            requestAnimationFrame(
                () => {

                    /*
                     * 如果以前曾經在隱藏狀態下
                     * 建立過 Chart instance，
                     * 先要求它重新測量尺寸。
                     */
                    const charts = [

                        sentimentChartInstance,

                        categoryChartInstance,

                        deptChartInstance,

                        trendChartInstance

                    ];


                    charts.forEach(
                        chart => {

                            if (
                                chart

                                &&

                                typeof chart.resize
                                ===
                                'function'
                            ) {

                                chart.resize();

                            }

                        }
                    );


                    drawDashboardCharts();



                    /*
                     * Theory Dashboard charts
                     */
                    const theoryCharts = [

                        typeof theoryRussellChartInstance !== 'undefined'
                            ? theoryRussellChartInstance
                            : null,

                        typeof theoryWarrChartInstance !== 'undefined'
                            ? theoryWarrChartInstance
                            : null,

                        typeof theoryJdrProcessChartInstance !== 'undefined'
                            ? theoryJdrProcessChartInstance
                            : null,

                        typeof theoryJdrEvidenceChartInstance !== 'undefined'
                            ? theoryJdrEvidenceChartInstance
                            : null

                    ];


                    theoryCharts.forEach(
                        chart => {

                            if (
                                chart

                                &&

                                typeof chart.resize
                                ===
                                'function'
                            ) {

                                chart.resize();

                            }

                        }
                    );

                }
            );

        }
    );

}

}
/* ==========================================================
   Utility
   ========================================================== */

function escapeHtml(
    value
) {

    if (
        value === null

        ||

        value === undefined
    ) {

        return '';

    }


    return String(
        value
    )
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#039;'
        );

}


function normalizeArray(
    value
) {

    if (
        Array.isArray(
            value
        )
    ) {

        return value;

    }


    if (
        !value
    ) {

        return [];

    }


    if (
        typeof value === 'string'
    ) {

        try {

            const parsed =
                JSON.parse(
                    value
                );


            if (
                Array.isArray(
                    parsed
                )
            ) {

                return parsed;

            }

        } catch (error) {

            // Legacy fallback.

        }


        return value
            .split(',')
            .map(
                item =>
                    item.trim()
            )
            .filter(
                Boolean
            );

    }


    return [];

}


function renderTheoryList(
    value
) {

    const items =
        normalizeArray(
            value
        );


    if (
        !items.length
    ) {

        return `
            <span class="text-muted small">
                未識別到明確資訊
            </span>
        `;

    }


    return items
        .map(
            item => `
                <span class="theory-pill">
                    ${escapeHtml(item)}
                </span>
            `
        )
        .join('');

}


function getSentimentLabel(
    sentiment
) {

    const labels = {

        Positive:
            '正面',

        Neutral:
            '中立',

        Negative:
            '負面'

    };


    return labels[sentiment]
        ||
        sentiment
        ||
        '未分析';

}


function getAffectiveStateLabel(
    state
) {

    if (
        !state
    ) {

        return '未分析';

    }


    const labels = {

        enthusiasm:
            '積極投入',

        contentment:
            '穩定滿意',

        anxiety:
            '緊張焦慮',

        depression_related:
            '低活力負向狀態',

        mixed:
            '混合情緒',

        unclear:
            '狀態不明'

    };


    return labels[state]
        ||
        '狀態不明';

}


function getAffectiveDescription(
    state
) {

    if (
        !state
    ) {

        return '此筆資料尚未進行情緒狀態分析。';

    }


    const descriptions = {

        enthusiasm:
            '整體呈現正向且較高活化的工作情緒，通常伴隨較高的投入感與行動能量。',

        contentment:
            '整體呈現正向且較低活化的工作情緒，通常反映相對穩定與滿意的工作體驗。',

        anxiety:
            '整體呈現負向且較高活化的工作情緒，可能伴隨緊張、壓力或高度警覺。',

        depression_related:
            '整體呈現負向且較低活化的工作情緒；此為工作情緒分類，不代表臨床診斷。',

        mixed:
            '文字同時包含多種具有意義的正向與負向工作情緒訊號。',

        unclear:
            '目前文字證據不足，無法做出穩健的工作情緒狀態判讀。'

    };


    return descriptions[state]
        ||
        descriptions.unclear;

}


function getJdrProcessLabel(
    process
) {

    if (
        !process
    ) {

        return '未分析';

    }


    const labels = {

        health_impairment:
            '壓力耗損傾向',

        motivational:
            '正向激勵傾向',

        mixed:
            '混合狀態',

        insufficient_evidence:
            '證據不足'

    };


    return labels[process]
        ||
        '證據不足';

}


function normalizeConfidence(
    confidence
) {

    const value =
        String(
            confidence
            ||
            ''
        )
            .toLowerCase();


    return [
        'high',
        'medium',
        'low'
    ].includes(
        value
    )

        ? value

        : null;

}


function getConfidenceLabel(
    confidence
) {

    const labels = {

        high:
            '高',

        medium:
            '中',

        low:
            '低'

    };


    return confidence

        ? labels[confidence]

        : '未分析';

}


/* ==========================================================
   Theory detail modal
   ========================================================== */

function showTheoryAnalysis(
    feedbackId
) {

    const item =
        allFeedbackData.find(
            row =>
                Number(row.id)
                ===
                Number(feedbackId)
        );


    if (
        !item
    ) {

        alert(
            '找不到這筆回饋資料。'
        );

        return;

    }


    const feedbackEl =
        document.getElementById(
            'theory-feedback'
        );


    const reasoningEl =
        document.getElementById(
            'theory-reasoning'
        );


    const sentimentEl =
        document.getElementById(
            'theory-general-sentiment'
        );


    const categoryEl =
        document.getElementById(
            'theory-category'
        );


    if (
        feedbackEl
    ) {

        feedbackEl.textContent =
            item.feedback
            ||
            '未提供';

    }


    if (
        reasoningEl
    ) {

        reasoningEl.textContent =
            item.reasoning
            ||
            '未提供分析依據';

    }


    if (
        sentimentEl
    ) {

        sentimentEl.textContent =

            `${getSentimentLabel(item.sentiment)} (${item.sentiment_score ?? '—'}分)`;

    }


    if (
        categoryEl
    ) {

        categoryEl.textContent =
            item.category
            ||
            '未分類';

    }



    const hasValence =

        item.valence_score
        !== null

        &&

        item.valence_score
        !== undefined

        &&

        item.valence_score
        !== '';


    const hasArousal =

        item.arousal_score
        !== null

        &&

        item.arousal_score
        !== undefined

        &&

        item.arousal_score
        !== '';


    const valence =

        hasValence

            ? Number(
                item.valence_score
            )

            : null;


    const arousal =

        hasArousal

            ? Number(
                item.arousal_score
            )

            : null;



    const valenceEl =
        document.getElementById(
            'theory-valence'
        );


    const arousalEl =
        document.getElementById(
            'theory-arousal'
        );


    if (
        valenceEl
    ) {

        valenceEl.textContent =

            hasValence

                ? `${valence > 0 ? '+' : ''}${valence} / 5`

                : '未分析';

    }


    if (
        arousalEl
    ) {

        arousalEl.textContent =

            hasArousal

                ? `${arousal} / 5`

                : '未分析';

    }



    const dot =
        document.getElementById(
            'circumplex-dot'
        );


    if (
        dot
    ) {

        if (
            hasValence

            &&

            hasArousal

            &&

            Number.isFinite(
                valence
            )

            &&

            Number.isFinite(
                arousal
            )
        ) {

            const x =
                Math.max(
                    0,
                    Math.min(
                        100,
                        (
                            (
                                valence
                                + 5
                            )
                            /
                            10
                        )
                        *
                        100
                    )
                );


            const y =
                Math.max(
                    0,
                    Math.min(
                        100,
                        100
                        -
                        (
                            (
                                arousal
                                - 1
                            )
                            /
                            4
                        )
                        *
                        100
                    )
                );


            dot.style.left =
                `${x}%`;


            dot.style.top =
                `${y}%`;


            dot.style.display =
                'block';

        } else {

            dot.style.display =
                'none';

        }

    }



    const affectEl =
        document.getElementById(
            'theory-affective-state'
        );


    const affectDescriptionEl =
        document.getElementById(
            'theory-affective-description'
        );


    if (
        affectEl
    ) {

        affectEl.textContent =
            getAffectiveStateLabel(
                item.affective_state
            );

    }


    if (
        affectDescriptionEl
    ) {

        affectDescriptionEl.textContent =
            getAffectiveDescription(
                item.affective_state
            );

    }



    const demandsEl =
        document.getElementById(
            'theory-demands'
        );


    const resourcesEl =
        document.getElementById(
            'theory-resources'
        );


    const strainEl =
        document.getElementById(
            'theory-strain'
        );


    const motivationEl =
        document.getElementById(
            'theory-motivation'
        );


    if (
        demandsEl
    ) {

        demandsEl.innerHTML =
            renderTheoryList(
                item.job_demands
            );

    }


    if (
        resourcesEl
    ) {

        resourcesEl.innerHTML =
            renderTheoryList(
                item.job_resources
            );

    }


    if (
        strainEl
    ) {

        strainEl.innerHTML =
            renderTheoryList(
                item.strain_indicators
            );

    }


    if (
        motivationEl
    ) {

        motivationEl.innerHTML =
            renderTheoryList(
                item.motivational_indicators
            );

    }



    const jdrEl =
        document.getElementById(
            'theory-jdr-process'
        );


    if (
        jdrEl
    ) {

        jdrEl.textContent =
            getJdrProcessLabel(
                item.jdr_process
            );

    }



    const confidence =
        normalizeConfidence(
            item.analysis_confidence
        );


    const confidenceEl =
        document.getElementById(
            'theory-confidence'
        );


    if (
        confidenceEl
    ) {

        confidenceEl.textContent =
            getConfidenceLabel(
                confidence
            );


        confidenceEl.className =

            confidence

                ? `analysis-confidence confidence-${confidence}`

                : 'analysis-confidence confidence-unknown';

    }



    const modalEl =
        document.getElementById(
            'theoryAnalysisModal'
        );


    if (
        modalEl

        &&

        typeof bootstrap
        !== 'undefined'
    ) {

        const modal =
            bootstrap.Modal.getOrCreateInstance(
                modalEl
            );


        modal.show();

    }

}


/* ==========================================================
   Load feedback
   ========================================================== */

async function loadFeedbacks() {
    setWorkspaceLoadState('loading');

    try {

        const response =
            await fetch(
                '/api/admin/feedbacks'
            );


        const result =
            await response.json();


        if (
            !response.ok
        ) {

            throw new Error(
                result.error
                ||
                'API request failed'
            );

        }


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '載入資料失敗'
            );

        }


        allFeedbackData =
            Array.isArray(
                result.data
            )

                ? result.data

                : [];


        applyFilters();
        setWorkspaceLoadState('ready');


    } catch (error) {
        setWorkspaceLoadState('error', '\u8cc7\u6599\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u6309\u300c\u66f4\u65b0\u8cc7\u6599\u300d\u91cd\u8a66\u3002');

        console.error(
            'loadFeedbacks:',
            error
        );


        const tbody =
            document.getElementById(
                'feedbackTableBody'
            );


        if (
            tbody
        ) {

            tbody.innerHTML = `

                <tr>

                    <td
                        colspan="4"
                        class="
                            text-center
                            text-danger
                            py-5
                        "
                    >

                        無法載入回饋資料

                    </td>

                </tr>

            `;

        }

    }

}


/* ==========================================================
   Table filter
   ========================================================== */

function applyFilters() {

    const startDateValue =
        document.getElementById(
            'filter-start-date'
        )?.value
        ||
        '';


    const endDateValue =
        document.getElementById(
            'filter-end-date'
        )?.value
        ||
        '';


    const dept =
        document.getElementById(
            'filter-dept'
        )?.value
        ||
        'all';


    const sentiment =
        document.getElementById(
            'filter-sentiment'
        )?.value
        ||
        'all';


    const category =
        document.getElementById(
            'filter-category'
        )?.value
        ||
        'all';


    const classic =
        document.getElementById(
            'filter-classic'
        )?.value
        ||
        'all';


    const sortOrderEl =
        document.getElementById(
            'sort-order'
        );


    const sortOrder =
        sortOrderEl?.value
        ||
        'desc';


    localStorage.setItem(
        'adminPreferredSort',
        sortOrder
    );


    /*
        取得這筆回饋真正用於管理與分析的日期。

        優先：
        feedback_date

        舊資料 fallback：
        created_at

        統一格式：
        YYYY-MM-DD
    */
    function getFeedbackDateKey(
        item
    ) {

        const rawDate =
            item?.feedback_date
            ||
            item?.created_at
            ||
            '';


        if (
            !rawDate
        ) {

            return '';

        }


        return String(
            rawDate
        )
            .slice(
                0,
                10
            )
            .replaceAll(
                '/',
                '-'
            );

    }


    let filteredData =
        allFeedbackData.filter(
            item => {

                const itemDate =
                    getFeedbackDateKey(
                        item
                    );


                let passTime =
                    true;


                if (
                    startDateValue
                ) {

                    passTime =
                        passTime
                        &&
                        Boolean(
                            itemDate
                        )
                        &&
                        itemDate
                        >=
                        startDateValue;

                }


                if (
                    endDateValue
                ) {

                    passTime =
                        passTime
                        &&
                        Boolean(
                            itemDate
                        )
                        &&
                        itemDate
                        <=
                        endDateValue;

                }


                const passDept =

                    dept === 'all'

                    ||

                    (
                        item.department
                        ||
                        '未提供'
                    )
                    ===
                    dept;


                const passSentiment =

                    sentiment === 'all'

                    ||

                    item.sentiment
                    ===
                    sentiment;


                const passCategory =

                    category === 'all'

                    ||

                    (
                        item.category
                        ||
                        ''
                    )
                    ===
                    category;


                const passClassic =

                    classic === 'all'

                    ||

                    (
                        classic === 'true'

                        &&

                        Number(
                            item.is_classic
                        )
                        ===
                        1
                    );


                return (

                    passTime

                    &&

                    passDept

                    &&

                    passSentiment

                    &&

                    passCategory

                    &&

                    passClassic

                );

            }
        );


    /*
        主要依 feedback_date 排序。

        如果兩筆回饋日期相同，
        再使用 created_at 決定先後。
    */
    filteredData.sort(
        (
            a,
            b
        ) => {

            const feedbackDateA =
                getFeedbackDateKey(
                    a
                );


            const feedbackDateB =
                getFeedbackDateKey(
                    b
                );


            let comparison =
                feedbackDateA.localeCompare(
                    feedbackDateB
                );


            /*
                相同回饋日期時，
                用真正建立時間作為第二排序條件。
            */
            if (
                comparison === 0
            ) {

                const createdA =
                    String(
                        a.created_at
                        ||
                        ''
                    );


                const createdB =
                    String(
                        b.created_at
                        ||
                        ''
                    );


                comparison =
                    createdA.localeCompare(
                        createdB
                    );

            }


            return (
                sortOrder === 'asc'

                    ? comparison

                    : -comparison
            );

        }
    );


    renderTable(
        filteredData
    );


    renderCharts(
        filteredData
    );

}

/* ==========================================================
   Render feedback table
   ========================================================== */

function renderTable(
    data
) {

    let table =
        document.getElementById(
            'feedbackTable'
        );


    if (
        !table
    ) {

        return;

    }


    if (
        dataTableInstance
    ) {

        dataTableInstance.destroy();

        dataTableInstance =
            null;

        // Destroy restores a replacement table. Refresh the reference before
        // changing headers, so batch mode and row actions stay aligned.
        table = document.getElementById('feedbackTable');

        if (!table) return;

    }



    let thead =
        table.querySelector(
            'thead'
        );


    if (
        !thead
    ) {

        thead =
            document.createElement(
                'thead'
            );


        table.appendChild(
            thead
        );

    }



    let theadHTML =
        '<tr>';


    if (
        isEditMode
    ) {

        theadHTML += `

            <th
                style="width: 55px;"
                class="text-center"
            >
                選取
            </th>

        `;

    }


    theadHTML += `

        <th class="feedback-meta-column">
            回饋日期與分類
        </th>

        <th class="feedback-content-column">
            回饋內容
        </th>

        <th class="feedback-summary-column">
            分析摘要
        </th>

    `;


    if (
        !isEditMode
    ) {

        theadHTML += `

            <th class="feedback-actions-column">
                操作
            </th>

        `;

    }


    theadHTML +=
        '</tr>';


    thead.innerHTML =
        theadHTML;



    let tbody =
        document.getElementById(
            'feedbackTableBody'
        );


    if (
        !tbody
    ) {

        tbody =
            document.createElement(
                'tbody'
            );


        tbody.id =
            'feedbackTableBody';


        table.appendChild(
            tbody
        );

    }


    tbody.innerHTML =
        '';



    if (
        !data.length
    ) {

        tbody.innerHTML = `

            <tr>

                <td
                    colspan="${isEditMode ? 4 : 4}"
                    class="
                        text-center
                        text-muted
                        py-5
                    "
                >
                    目前沒有符合條件的回饋
                </td>

            </tr>

        `;

    }



    data.forEach(
        item => {

            const badgeColor =

                item.sentiment === 'Negative'

                    ? 'bg-danger'

                    : item.sentiment === 'Positive'

                      ? 'bg-success'

                      : 'bg-secondary';



            const classicBtnClass =

                Number(
                    item.is_classic
                )
                ===
                1

                    ? 'btn-warning'

                    : 'btn-outline-warning';



            const classicBtnText =

                Number(
                    item.is_classic
                )
                ===
                1

                    ? '已設為參考範例'

                    : '設為參考範例';



            const correctedBadge =

                item.sentiment
                !==
                item.original_sentiment

                    ? `
                        <span
                            class="
                                badge
                                bg-warning
                                ms-1
                            "
                        >
                            HR 已校正
                        </span>
                    `

                    : '';



            const confidence =
                normalizeConfidence(
                    item.analysis_confidence
                );


            const affectLabel =
                getAffectiveStateLabel(
                    item.affective_state
                );


            const jdrLabel =
                getJdrProcessLabel(
                    item.jdr_process
                );



            const tr =
                document.createElement(
                    'tr'
                );


            let html =
                '';



            if (
                isEditMode
            ) {

                html += `

                    <td
                        class="
                            text-center
                            align-middle
                        "
                    >

                        <input
                            type="checkbox"
                            class="
                                row-checkbox
                                form-check-input
                            "
                            value="${Number(item.id)}"
                        >

                    </td>

                `;

            }



            html += `

                <td>

    <div
        class="
            fw-semibold
            text-dark
        "
        style="
            font-size: 0.82rem;
        "
    >
        ${escapeHtml(
            item.feedback_date
            ||
            (
                item.created_at
                    ? item.created_at.split(' ')[0]
                    : ''
            )
        )}
    </div>


    <div
        class="
            text-muted
            mt-1
        "
        style="
            font-size: 0.68rem;
        "
    >
        建立時間：
        ${escapeHtml(
            item.created_at
            ||
            '—'
        )}
    </div>


    ${
        Number(
            item.is_demo
        ) === 1

            ? `
                <div class="mt-2">

                    <span
                        class="
                            badge
                            bg-light
                            text-secondary
                            border
                        "
                    >
                        Demo 資料
                    </span>

                </div>
            `

            : ''
    }


    <div
        class="
            d-flex
            flex-column
            align-items-start
            mt-2
            gap-1
        "
    >

                        <span class="badge bg-info">

                            ${escapeHtml(item.department || '未提供')}

                        </span>


                        <span
                            class="
                                badge
                                bg-light
                                text-dark
                                border
                            "
                        >

                            ${escapeHtml(item.category || '未分類')}

                        </span>

                    </div>

                </td>



                <td>

                    <p class="mb-0">

                        ${escapeHtml(item.feedback || '')}

                    </p>

                </td>



                <td>

                    <div
                        class="
                            d-flex
                            align-items-center
                            flex-wrap
                            gap-1
                            mb-2
                        "
                    >

                        <span
                            class="
                                badge
                                ${badgeColor}
                                badge-sentiment
                            "
                        >

                            ${getSentimentLabel(item.sentiment)}
                            (${item.sentiment_score ?? '—'}分)

                        </span>


                        ${correctedBadge}

                    </div>


                    <div class="theory-summary">

                        <span class="theory-badge">

                            工作情緒：
                            ${escapeHtml(affectLabel)}

                        </span>


                        <span class="theory-badge">

                            JD-R：
                            ${escapeHtml(jdrLabel)}

                        </span>


                        <span
                            class="
                                theory-badge
                                ${
                                    confidence

                                        ? `confidence-${confidence}`

                                        : 'confidence-unknown'
                                }
                            "
                        >

                            可信度：
                            ${escapeHtml(getConfidenceLabel(confidence))}

                        </span>

                    </div>


                    <button
                        type="button"
                        class="
                            btn
                            btn-sm
                            btn-outline-success
                            mt-2
                        "
                        onclick="showTheoryAnalysis(${Number(item.id)})"
                    >

                        查看分析詳情

                    </button>

                </td>

            `;



            if (
                !isEditMode
            ) {

                html += `

                    <td class="align-middle feedback-actions-column">

                        <button
                            type="button"
                            class="
                                btn
                                btn-sm
                                btn-outline-primary
                                mb-2
                                w-100
                            "
                            onclick="correctSentiment(${Number(item.id)})"
                        >
                            人工校正
                        </button>


                        <button
                            type="button"
                            class="
                                btn
                                btn-sm
                                ${classicBtnClass}
                                mb-2
                                w-100
                            "
                            onclick="toggleClassic(${Number(item.id)})"
                        >
                            ${classicBtnText}
                        </button>


                        <button
                            type="button"
                            class="
                                btn
                                btn-sm
                                btn-outline-danger
                                w-100
                            "
                            onclick="deleteFeedback(${Number(item.id)})"
                        >
                            刪除
                        </button>

                    </td>

                `;

            }



            tr.innerHTML =
                html;


            tbody.appendChild(
                tr
            );

        }
    );



    if (
        typeof simpleDatatables
        === 'undefined'
    ) {

        console.error(
            'Simple Datatables library not loaded.'
        );

        return;

    }



    const savedPageSize =
        Number(
            localStorage.getItem(
                'adminPreferredPageSize'
            )
        )
        ||
        5;



    dataTableInstance =
        new simpleDatatables.DataTable(
            table,
            {

                searchable:
                    true,

                fixedHeight:
                    false,

                perPage:
                    savedPageSize,

                perPageSelect: [
                    5,
                    10,
                    15,
                    20,
                    50
                ],

                labels: {

                    placeholder:
                        '搜尋回饋...',

                    perPage:
                        '筆 / 頁',

                    noRows:
                        '找不到資料',

                    info:
                        '顯示 {start} 到 {end}，共 {rows} 筆'

                }

            }
        );



    if (
        dataTableInstance
        &&
        typeof dataTableInstance.on
        === 'function'
    ) {

        dataTableInstance.on(
            'datatable.perpage',
            perPage => {

                localStorage.setItem(
                    'adminPreferredPageSize',
                    perPage
                );

            }
        );

    }

}


/* ==========================================================
   Batch mode
   ========================================================== */

function toggleEditMode() {

    isEditMode =
        !isEditMode;


    const actionButtons =
        document.getElementById(
            'batch-action-buttons'
        );


    const toggleButton =
        document.getElementById(
            'toggle-edit-mode'
        );


    if (
        actionButtons
    ) {

        actionButtons.style.display =

            isEditMode

                ? 'flex'

                : 'none';

    }


    if (
        toggleButton
    ) {

        toggleButton.textContent =

            isEditMode

                ? '取消批次操作'

                : '開啟批次操作';

    }


    applyFilters();

}


async function batchAction(
    actionType
) {

    const checked =
        Array.from(
            document.querySelectorAll(
                '.row-checkbox:checked'
            )
        );


    if (
        !checked.length
    ) {

        alert(
            '請至少選取一筆資料。'
        );

        return;

    }


    const ids =
        checked.map(
            box =>
                Number(
                    box.value
                )
        );



    try {

        if (
            actionType === 'delete'
        ) {

            if (
                !confirm(
                    `確定要刪除選取的 ${ids.length} 筆回饋嗎？`
                )
            ) {

                return;

            }


            for (
                const id
                of
                ids
            ) {

                await fetch(
                    `/api/admin/feedbacks/${id}`,
                    {
                        method:
                            'DELETE'
                    }
                );

            }

        }



        if (
            actionType === 'correct'
        ) {

            const choice =
                prompt(
                    '修正後的情緒：\n1 = Positive\n2 = Neutral\n3 = Negative'
                );


            const newSentiment =

                choice === '1'

                    ? 'Positive'

                    : choice === '2'

                      ? 'Neutral'

                      : choice === '3'

                        ? 'Negative'

                        : null;


            if (
                !newSentiment
            ) {

                return;

            }


            for (
                const id
                of
                ids
            ) {

                await fetch(
                    `/api/admin/feedbacks/${id}/sentiment`,
                    {

                        method:
                            'PUT',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body:
                            JSON.stringify(
                                {
                                    sentiment:
                                        newSentiment
                                }
                            )

                    }
                );

            }

        }



        if (
            actionType === 'classic'
        ) {

            for (
                const id
                of
                ids
            ) {

                await fetch(
                    `/api/admin/feedbacks/${id}/classic`,
                    {
                        method:
                            'PUT'
                    }
                );

            }

        }


        isEditMode =
            false;


        const actionButtons =
            document.getElementById(
                'batch-action-buttons'
            );


        if (
            actionButtons
        ) {

            actionButtons.style.display =
                'none';

        }


        const toggleButton =
            document.getElementById(
                'toggle-edit-mode'
            );


        if (
            toggleButton
        ) {

            toggleButton.textContent =
                '開啟批次操作';

        }


        await loadFeedbacks();


    } catch (error) {

        console.error(
            'batchAction:',
            error
        );


        alert(
            '批次操作失敗，請稍後再試。'
        );

    }

}


/* ==========================================================
   Single feedback actions
   ========================================================== */

async function deleteFeedback(
    id
) {

    if (
        !confirm(
            '確定要將這筆回饋移至回收桶嗎？'
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/feedbacks/${id}`,
                {
                    method:
                        'DELETE'
                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '刪除失敗'
            );

        }


        await loadFeedbacks();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '刪除失敗。'
        );

    }

}


async function toggleClassic(
    id
) {

    try {

        const response =
            await fetch(
                `/api/admin/feedbacks/${id}/classic`,
                {
                    method:
                        'PUT'
                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '更新失敗'
            );

        }


        await loadFeedbacks();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '參考範例狀態更新失敗。'
        );

    }

}


async function correctSentiment(
    id
) {

    const choice =
        prompt(
            '修正後的情緒：\n1 = Positive\n2 = Neutral\n3 = Negative'
        );


    const sentiment =

        choice === '1'

            ? 'Positive'

            : choice === '2'

              ? 'Neutral'

              : choice === '3'

                ? 'Negative'

                : null;


    if (
        !sentiment
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/feedbacks/${id}/sentiment`,
                {

                    method:
                        'PUT',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify(
                            {
                                sentiment:
                                    sentiment
                            }
                        )

                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '校正失敗'
            );

        }


        await loadFeedbacks();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '情緒校正失敗。'
        );

    }

}


/* ==========================================================
   Dashboard
   ========================================================== */

function getDashboardDateKey(
    item
) {

    const rawDate =
        item?.feedback_date
        ||
        item?.created_at
        ||
        '';


    if (
        !rawDate
    ) {

        return '';

    }


    return String(
        rawDate
    )
        .slice(
            0,
            10
        )
        .replaceAll(
            '/',
            '-'
        );

}


function setDashboardSelectOptions(
    selectId,
    values,
    defaultLabel
) {

    const select =
        document.getElementById(
            selectId
        );


    if (
        !select
    ) {

        return;

    }


    const currentValue =
        select.value;


    select.innerHTML =
        '';


    const defaultOption =
        document.createElement(
            'option'
        );


    defaultOption.value =
        '';


    defaultOption.textContent =
        defaultLabel;


    select.appendChild(
        defaultOption
    );


    values.forEach(
        value => {

            const option =
                document.createElement(
                    'option'
                );


            option.value =
                value;


            option.textContent =
                value;


            select.appendChild(
                option
            );

        }
    );


    if (
        values.includes(
            currentValue
        )
    ) {

        select.value =
            currentValue;

    }

}


function initializeGlobalFilterOptions() {

    const departments =
        [
            ...new Set(
                baseDashboardData.map(
                    item =>
                        item.department
                        ||
                        '未提供'
                )
            )
        ].sort();


    const categories =
        [
            ...new Set(
                baseDashboardData.map(
                    item =>
                        item.category
                        ||
                        '未分類'
                )
            )
        ].sort();


    setDashboardSelectOptions(
        'global-filter-department',
        departments,
        '全部部門'
    );


    setDashboardSelectOptions(
        'global-filter-category',
        categories,
        '全部議題'
    );

}


function syncGlobalFilterControls() {

    const department =
        document.getElementById(
            'global-filter-department'
        );


    const category =
        document.getElementById(
            'global-filter-category'
        );


    const startDate =
        document.getElementById(
            'global-filter-start-date'
        );


    const endDate =
        document.getElementById(
            'global-filter-end-date'
        );


    if (
        department
    ) {

        department.value =
            globalFilters.department
            ||
            '';

    }


    if (
        category
    ) {

        category.value =
            globalFilters.category
            ||
            '';

    }


    if (
        startDate
    ) {

        startDate.value =
            globalFilters.startDate
            ||
            '';

    }


    if (
        endDate
    ) {

        endDate.value =
            globalFilters.endDate
            ||
            '';

    }

}


function handleGlobalFilterChange() {

    globalFilters.department =
        document.getElementById(
            'global-filter-department'
        )?.value
        ||
        null;


    globalFilters.category =
        document.getElementById(
            'global-filter-category'
        )?.value
        ||
        null;


    globalFilters.startDate =
        document.getElementById(
            'global-filter-start-date'
        )?.value
        ||
        null;


    globalFilters.endDate =
        document.getElementById(
            'global-filter-end-date'
        )?.value
        ||
        null;


    drawDashboardCharts();

}


function getAffectQuadrantConfig(
    quadrant
) {

    const configs = {

        positive_high: {
            label: '正向高活化',
            valenceMin: 1,
            valenceMax: 5,
            arousalMin: 4,
            arousalMax: 5
        },


        positive_low: {
            label: '正向低活化',
            valenceMin: 1,
            valenceMax: 5,
            arousalMin: 1,
            arousalMax: 2
        },


        negative_high: {
            label: '負向高活化',
            valenceMin: -5,
            valenceMax: -1,
            arousalMin: 4,
            arousalMax: 5
        },


        negative_low: {
            label: '負向低活化',
            valenceMin: -5,
            valenceMax: -1,
            arousalMin: 1,
            arousalMax: 2
        }

    };


    return configs[
        quadrant
    ]
    ||
    null;

}


function getAffectQuadrantLabel(
    quadrant
) {

    return (
        getAffectQuadrantConfig(
            quadrant
        )?.label
        ||
        ''
    );

}


function syncAffectFilterControls() {

    const valenceMin =
        document.getElementById(
            'affect-valence-min'
        );


    const valenceMax =
        document.getElementById(
            'affect-valence-max'
        );


    const arousalMin =
        document.getElementById(
            'affect-arousal-min'
        );


    const arousalMax =
        document.getElementById(
            'affect-arousal-max'
        );


    if (
        valenceMin
    ) {

        valenceMin.value =
            String(
                affectFilters.valenceMin
                ??
                -5
            );

    }


    if (
        valenceMax
    ) {

        valenceMax.value =
            String(
                affectFilters.valenceMax
                ??
                5
            );

    }


    if (
        arousalMin
    ) {

        arousalMin.value =
            String(
                affectFilters.arousalMin
                ??
                1
            );

    }


    if (
        arousalMax
    ) {

        arousalMax.value =
            String(
                affectFilters.arousalMax
                ??
                5
            );

    }


    const buttonMap = {

        all:
            'affect-quadrant-all',

        positive_high:
            'affect-quadrant-positive-high',

        positive_low:
            'affect-quadrant-positive-low',

        negative_high:
            'affect-quadrant-negative-high',

        negative_low:
            'affect-quadrant-negative-low'

    };


    const fullRange =

        affectFilters.valenceMin
        ===
        null

        &&

        affectFilters.valenceMax
        ===
        null

        &&

        affectFilters.arousalMin
        ===
        null

        &&

        affectFilters.arousalMax
        ===
        null;


    Object.entries(
        buttonMap
    )
    .forEach(
        (
            [
                key,
                id
            ]
        ) => {

            const button =
                document.getElementById(
                    id
                );


            if (
                !button
            ) {

                return;

            }


            const active =

                key
                ===
                'all'

                    ? (
                        !affectFilters.quadrant

                        &&

                        fullRange

                        &&

                        affectFilters.valence
                        ===
                        null

                        &&

                        affectFilters.arousal
                        ===
                        null
                    )

                    : affectFilters.quadrant
                      ===
                      key;


            button.classList.toggle(
                'is-active',
                active
            );


            button.setAttribute(
                'aria-pressed',

                active

                    ? 'true'

                    : 'false'
            );

        }
    );

}


function handleAffectRangeChange() {

    const valenceMinEl =
        document.getElementById(
            'affect-valence-min'
        );


    const valenceMaxEl =
        document.getElementById(
            'affect-valence-max'
        );


    const arousalMinEl =
        document.getElementById(
            'affect-arousal-min'
        );


    const arousalMaxEl =
        document.getElementById(
            'affect-arousal-max'
        );


    if (
        !valenceMinEl
        ||
        !valenceMaxEl
        ||
        !arousalMinEl
        ||
        !arousalMaxEl
    ) {

        return;

    }


    let valenceMin =
        Number(
            valenceMinEl.value
        );


    let valenceMax =
        Number(
            valenceMaxEl.value
        );


    let arousalMin =
        Number(
            arousalMinEl.value
        );


    let arousalMax =
        Number(
            arousalMaxEl.value
        );


    /*
     * 防止 Min > Max。
     * 如果選反，自動交換。
     */
    if (
        valenceMin
        >
        valenceMax
    ) {

        [
            valenceMin,
            valenceMax
        ] = [
            valenceMax,
            valenceMin
        ];

    }


    if (
        arousalMin
        >
        arousalMax
    ) {

        [
            arousalMin,
            arousalMax
        ] = [
            arousalMax,
            arousalMin
        ];

    }


    /*
     * 自訂 Range 時，
     * 取消四象限與 Bubble 精確座標。
     */
    affectFilters.quadrant =
        null;


    affectFilters.valence =
        null;


    affectFilters.arousal =
        null;


    /*
     * 完整範圍使用 null，
     * 代表「不限制」。
     */
    affectFilters.valenceMin =

        valenceMin
        ===
        -5

            ? null

            : valenceMin;


    affectFilters.valenceMax =

        valenceMax
        ===
        5

            ? null

            : valenceMax;


    affectFilters.arousalMin =

        arousalMin
        ===
        1

            ? null

            : arousalMin;


    affectFilters.arousalMax =

        arousalMax
        ===
        5

            ? null

            : arousalMax;


    syncAffectFilterControls();


    drawDashboardCharts();

}


function setAffectQuadrant(
    quadrant
) {

    /*
     * 四象限快捷與精確 Bubble
     * 互斥。
     */
    affectFilters.valence =
        null;


    affectFilters.arousal =
        null;


    if (
        !quadrant
        ||
        quadrant
        ===
        'all'
    ) {

        /*
         * 只清除 Russell 篩選。
         * 不會清除右側工作情緒狀態篩選。
         */
        affectFilters.quadrant =
            null;


        affectFilters.valenceMin =
            null;


        affectFilters.valenceMax =
            null;


        affectFilters.arousalMin =
            null;


        affectFilters.arousalMax =
            null;

    } else {

        const config =
            getAffectQuadrantConfig(
                quadrant
            );


        if (
            !config
        ) {

            return;

        }


        affectFilters.quadrant =
            quadrant;


        affectFilters.valenceMin =
            config.valenceMin;


        affectFilters.valenceMax =
            config.valenceMax;


        affectFilters.arousalMin =
            config.arousalMin;


        affectFilters.arousalMax =
            config.arousalMax;

    }


    syncAffectFilterControls();


    drawDashboardCharts();

}


function renderCharts(
    data
) {

    baseDashboardData =
        Array.isArray(
            data
        )

            ? data

            : [];


    globalFilters =
        createEmptyGlobalFilters();


    overviewFilters =
        createEmptyOverviewFilters();


    affectFilters =
        createEmptyAffectFilters();


    jdrFilters =
        createEmptyJdrFilters();


    initializeGlobalFilterOptions();


    syncGlobalFilterControls();


    const dashboardSection =
        document.getElementById(
            'section-dashboard'
        );


    const dashboardIsVisible =
        dashboardSection

        &&

        window.getComputedStyle(
            dashboardSection
        ).display
        !==
        'none';


    if (
        !dashboardIsVisible
    ) {

        return;

    }


    drawDashboardCharts();

}


function clearGlobalFilters() {

    globalFilters =
        createEmptyGlobalFilters();


    syncGlobalFilterControls();


    drawDashboardCharts();

}


function clearOverviewFilters() {

    overviewFilters =
        createEmptyOverviewFilters();


    drawDashboardCharts();

}


function clearAffectFilters() {

    affectFilters =
        createEmptyAffectFilters();


    syncAffectFilterControls();


    drawDashboardCharts();

}


function clearJdrLocalFilters() {

    jdrFilters =
        createEmptyJdrFilters();


    drawDashboardCharts();

}


function clearAllFilters() {

    globalFilters =
        createEmptyGlobalFilters();


    overviewFilters =
        createEmptyOverviewFilters();


    affectFilters =
        createEmptyAffectFilters();


    jdrFilters =
        createEmptyJdrFilters();


    syncGlobalFilterControls();


    drawDashboardCharts();

}


function toggleLock(
    chartName
) {

    lockedCharts[chartName] =
        !lockedCharts[chartName];


    const button =
        document.getElementById(
            `lock-btn-${chartName}`
        );


    if (
        button
    ) {

        const icon =
            button.querySelector(
                'i'
            );


        if (
            icon
        ) {

            icon.className =

                lockedCharts[chartName]

                    ? 'bi bi-lock'

                    : 'bi bi-unlock';

        }

    }


    drawDashboardCharts();

}


function getGlobalScopedData() {

    return baseDashboardData.filter(
        item => {

            if (
                globalFilters.department

                &&

                (
                    item.department
                    ||
                    '未提供'
                )
                !==
                globalFilters.department
            ) {

                return false;

            }


            if (
                globalFilters.category

                &&

                (
                    item.category
                    ||
                    '未分類'
                )
                !==
                globalFilters.category
            ) {

                return false;

            }


            const dateKey =
                getDashboardDateKey(
                    item
                );


            if (
                globalFilters.startDate

                &&

                (
                    !dateKey

                    ||

                    dateKey
                    <
                    globalFilters.startDate
                )
            ) {

                return false;

            }


            if (
                globalFilters.endDate

                &&

                (
                    !dateKey

                    ||

                    dateKey
                    >
                    globalFilters.endDate
                )
            ) {

                return false;

            }


            return true;

        }
    );

}


function getOverviewScopedData(
    source
) {

    let data =
        [
            ...source
        ];


    if (
        overviewFilters.sentiment
    ) {

        data =
            data.filter(
                item =>
                    item.sentiment
                    ===
                    overviewFilters.sentiment
            );

    }


    return data;

}


function getAffectScopedData(
    source
) {

    let data =
        [
            ...source
        ];


    /*
     * Warr 工作情緒狀態
     */
    if (
        affectFilters.affectiveState
    ) {

        data =
            data.filter(
                item =>
                    item.affective_state
                    ===
                    affectFilters.affectiveState
            );

    }


    const hasValence =
        item =>

            item.valence_score
            !==
            null

            &&

            item.valence_score
            !==
            undefined

            &&

            item.valence_score
            !==
            '';


    const hasArousal =
        item =>

            item.arousal_score
            !==
            null

            &&

            item.arousal_score
            !==
            undefined

            &&

            item.arousal_score
            !==
            '';


    /*
     * Russell Bubble 精確座標
     */
    if (
        affectFilters.valence
        !==
        null
    ) {

        data =
            data.filter(
                item =>

                    hasValence(
                        item
                    )

                    &&

                    Number(
                        item.valence_score
                    )
                    ===
                    Number(
                        affectFilters.valence
                    )
            );

    }


    if (
        affectFilters.arousal
        !==
        null
    ) {

        data =
            data.filter(
                item =>

                    hasArousal(
                        item
                    )

                    &&

                    Number(
                        item.arousal_score
                    )
                    ===
                    Number(
                        affectFilters.arousal
                    )
            );

    }


    /*
     * Valence Range
     */
    if (
        affectFilters.valenceMin
        !==
        null
    ) {

        data =
            data.filter(
                item =>

                    hasValence(
                        item
                    )

                    &&

                    Number(
                        item.valence_score
                    )
                    >=
                    Number(
                        affectFilters.valenceMin
                    )
            );

    }


    if (
        affectFilters.valenceMax
        !==
        null
    ) {

        data =
            data.filter(
                item =>

                    hasValence(
                        item
                    )

                    &&

                    Number(
                        item.valence_score
                    )
                    <=
                    Number(
                        affectFilters.valenceMax
                    )
            );

    }


    /*
     * Arousal Range
     */
    if (
        affectFilters.arousalMin
        !==
        null
    ) {

        data =
            data.filter(
                item =>

                    hasArousal(
                        item
                    )

                    &&

                    Number(
                        item.arousal_score
                    )
                    >=
                    Number(
                        affectFilters.arousalMin
                    )
            );

    }


    if (
        affectFilters.arousalMax
        !==
        null
    ) {

        data =
            data.filter(
                item =>

                    hasArousal(
                        item
                    )

                    &&

                    Number(
                        item.arousal_score
                    )
                    <=
                    Number(
                        affectFilters.arousalMax
                    )
            );

    }


    return data;

}


function hasJdrEvidence(
    item,
    evidence
) {

    if (
        evidence
        ===
        'demands'
    ) {

        return (
            normalizeArray(
                item.job_demands
            ).length
            >
            0
        );

    }


    if (
        evidence
        ===
        'resources'
    ) {

        return (
            normalizeArray(
                item.job_resources
            ).length
            >
            0
        );

    }


    if (
        evidence
        ===
        'strain'
    ) {

        return (
            normalizeArray(
                item.strain_indicators
            ).length
            >
            0
        );

    }


    if (
        evidence
        ===
        'motivation'
    ) {

        return (
            normalizeArray(
                item.motivational_indicators
            ).length
            >
            0
        );

    }


    return true;

}


function getJdrScopedData(
    source
) {

    let data =
        [
            ...source
        ];


    if (
        jdrFilters.process
    ) {

        data =
            data.filter(
                item =>
                    item.jdr_process
                    ===
                    jdrFilters.process
            );

    }


    if (
        jdrFilters.evidence
    ) {

        data =
            data.filter(
                item =>
                    hasJdrEvidence(
                        item,
                        jdrFilters.evidence
                    )
            );

    }


    return data;

}


function updateGlobalFilterSummary(
    data
) {

    const count =
        document.getElementById(
            'global-filter-result-count'
        );


    if (
        count
    ) {

        count.textContent =
            `${data.length} / ${baseDashboardData.length} 筆`;

    }

}


function updateDashboardFilterStatus() {

    const row =
        document.getElementById(
            'filter-status-row'
        );


    const container =
        document.getElementById(
            'current-filter-badges'
        );


    if (
        !row
        ||
        !container
    ) {

        return;

    }


    const badges =
        [];


    if (
        overviewFilters.sentiment
    ) {

        badges.push(
            `
                <span class="badge bg-secondary">
                    情緒：
                    ${escapeHtml(
                        getSentimentLabel(
                            overviewFilters.sentiment
                        )
                    )}
                </span>
            `
        );

    }


    const hasFilters =
        badges.length
        >
        0;


    container.innerHTML =

        hasFilters

            ? badges.join('')

            : `
                <span class="dashboard-filter-empty">
                    無
                </span>
            `;


    const clearButton =
        row.querySelector(
            'button[onclick="clearOverviewFilters()"]'
        );


    if (
        clearButton
    ) {

        clearButton.disabled =
            !hasFilters;

    }

}


function updateAffectFilterStatus() {

    const container =
        document.getElementById(
            'affect-filter-badges'
        );


    const clearButton =
        document.getElementById(
            'clear-affect-filters'
        );


    const resultCount =
        document.getElementById(
            'affect-filter-result-count'
        );


    if (
        !container
    ) {

        return;

    }


    syncAffectFilterControls();


    const badges =
        [];


    /*
     * 工作情緒
     */
    if (
        affectFilters.affectiveState
    ) {

        badges.push(
            `
                <span class="badge bg-secondary">
                    工作情緒：
                    ${escapeHtml(
                        getAffectiveStateLabel(
                            affectFilters.affectiveState
                        )
                    )}
                </span>
            `
        );

    }


    /*
     * Bubble 精確座標
     */
    if (
        affectFilters.valence
        !==
        null

        ||

        affectFilters.arousal
        !==
        null
    ) {

        badges.push(
            `
                <span class="badge bg-secondary">
                    Russell 精確座標：
                    V ${escapeHtml(
                        affectFilters.valence
                        ??
                        '全部'
                    )}
                    /
                    A ${escapeHtml(
                        affectFilters.arousal
                        ??
                        '全部'
                    )}
                </span>
            `
        );

    }


    /*
     * 四象限
     */
    else if (
        affectFilters.quadrant
    ) {

        badges.push(
            `
                <span class="badge bg-secondary">
                    象限：
                    ${escapeHtml(
                        getAffectQuadrantLabel(
                            affectFilters.quadrant
                        )
                    )}
                </span>
            `
        );

    }


    /*
     * 自訂 Range
     */
    else {

        const hasRange =

            affectFilters.valenceMin
            !==
            null

            ||

            affectFilters.valenceMax
            !==
            null

            ||

            affectFilters.arousalMin
            !==
            null

            ||

            affectFilters.arousalMax
            !==
            null;


        if (
            hasRange
        ) {

            badges.push(
                `
                    <span class="badge bg-secondary">

                        Russell 範圍：

                        V ${escapeHtml(
                            affectFilters.valenceMin
                            ??
                            -5
                        )}

                        ～

                        ${escapeHtml(
                            affectFilters.valenceMax
                            ??
                            5
                        )}

                        /

                        A ${escapeHtml(
                            affectFilters.arousalMin
                            ??
                            1
                        )}

                        ～

                        ${escapeHtml(
                            affectFilters.arousalMax
                            ??
                            5
                        )}

                    </span>
                `
            );

        }

    }


    const hasFilters =
        badges.length
        >
        0;


    container.innerHTML =

        hasFilters

            ? badges.join('')

            : `
                <span class="dashboard-filter-empty">
                    無
                </span>
            `;


    if (
        clearButton
    ) {

        clearButton.disabled =
            !hasFilters;

    }


    /*
     * 顯示目前情緒區資料量
     */
    if (
        resultCount
    ) {

        const source =

            globalDashboardData.length

                ? globalDashboardData

                : getGlobalScopedData();


        const current =
            getAffectScopedData(
                source
            ).length;


        resultCount.textContent =
            `${current} / ${source.length} 筆`;

    }

}


function updateJdrFilterStatus() {

    const container =
        document.getElementById(
            'jdr-local-filter-badges'
        );


    const clearButton =
        document.getElementById(
            'clear-jdr-local-filters'
        );


    if (
        !container
    ) {

        return;

    }


    const badges =
        [];


    if (
        jdrFilters.process
    ) {

        badges.push(
            `
                <span class="badge bg-secondary">
                    JD-R：
                    ${escapeHtml(
                        getJdrProcessLabel(
                            jdrFilters.process
                        )
                    )}
                </span>
            `
        );

    }


    if (
        jdrFilters.evidence
    ) {

        const evidenceLabels = {

            demands:
                'Job Demands',

            resources:
                'Job Resources',

            strain:
                '壓力反應',

            motivation:
                '正向動機'

        };


        badges.push(
            `
                <span class="badge bg-secondary">
                    證據：
                    ${escapeHtml(
                        evidenceLabels[
                            jdrFilters.evidence
                        ]
                        ||
                        jdrFilters.evidence
                    )}
                </span>
            `
        );

    }


    const hasFilters =
        badges.length
        >
        0;


    container.innerHTML =

        hasFilters

            ? badges.join('')

            : `
                <span class="dashboard-filter-empty">
                    無
                </span>
            `;


    if (
        clearButton
    ) {

        clearButton.disabled =
            !hasFilters;

    }

}


function drawDashboardCharts() {

    globalDashboardData =
        getGlobalScopedData();


    const overviewData =
        getOverviewScopedData(
            globalDashboardData
        );


    const affectData =
        getAffectScopedData(
            globalDashboardData
        );


    const jdrData =
        getJdrScopedData(
            globalDashboardData
        );


    updateGlobalFilterSummary(
        globalDashboardData
    );


    updateDashboardFilterStatus();


    updateAffectFilterStatus();


    updateJdrFilterStatus();


    updateDashboardKpis(
        overviewData
    );


    drawSentimentChart(
        overviewData
    );


    drawCategoryChart(
        overviewData
    );


    drawDepartmentChart(
        overviewData
    );


    drawHeatmap(
        overviewData
    );


    drawWordCloud(
        overviewData
    );


    drawTrendChart(
        overviewData
    );


    if (
        typeof drawTheoryDashboardCharts
        ===
        'function'
    ) {

        drawTheoryDashboardCharts(
            affectData,
            jdrData
        );

    }

}


function updateDashboardKpis(
    data
) {
    updateWorkspaceBrief(data);

    const total =
        data.length;


    const positive =
        data.filter(
            item =>
                item.sentiment
                ===
                'Positive'
        ).length;


    const health =
        total

            ? Math.round(
                positive
                /
                total
                *
                100
            )

            : 0;



    const negative =
        data.filter(
            item =>
                item.sentiment
                ===
                'Negative'
        );


    let painPoint =
        '暫無';


    let department =
        '暫無';



    if (
        negative.length
    ) {

        const categoryCounts =
            {};


        const departmentCounts =
            {};


        negative.forEach(
            item => {

                const category =
                    item.category
                    ||
                    '未分類';


                const dept =
                    item.department
                    ||
                    '未提供';


                categoryCounts[category] =
                    (
                        categoryCounts[category]
                        ||
                        0
                    )
                    +
                    1;


                departmentCounts[dept] =
                    (
                        departmentCounts[dept]
                        ||
                        0
                    )
                    +
                    1;

            }
        );


        painPoint =
            Object.entries(
                categoryCounts
            )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b[1]
                        -
                        a[1]
                )[0]?.[0]
            ||
            '暫無';


        department =
            Object.entries(
                departmentCounts
            )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b[1]
                        -
                        a[1]
                )[0]?.[0]
            ||
            '暫無';

    }



    const totalEl =
        document.getElementById(
            'kpi-total'
        );


    const healthEl =
        document.getElementById(
            'kpi-health'
        );


    const painEl =
        document.getElementById(
            'kpi-painpoint'
        );


    const deptEl =
        document.getElementById(
            'kpi-dept'
        );


    if (
        totalEl
    ) {

        totalEl.textContent =
            total;

    }


    if (
        healthEl
    ) {

        healthEl.textContent =
            `${health}%`;

    }


    if (
        painEl
    ) {

        painEl.textContent =
            painPoint;

    }


    if (
        deptEl
    ) {

        deptEl.textContent =
            department;

    }

}


function drawSentimentChart(
    data
) {

    const canvas =
        document.getElementById(
            'sentimentChart'
        );


    if (
        !canvas
        ||
        typeof Chart === 'undefined'
    ) {

        return;

    }


    /*
     * 如果圖表被鎖定：
     * 使用完整 Dashboard 資料。
     *
     * 否則：
     * 使用目前篩選後的資料。
     */
    const source =

        lockedCharts.sentiment

            ? globalDashboardData

            : data;


    const counts = {
        Positive: 0,
        Neutral: 0,
        Negative: 0
    };


    source.forEach(
        item => {

            if (
                counts[item.sentiment]
                !== undefined
            ) {

                counts[item.sentiment]++;

            }

        }
    );


    const labels = [
        '正面',
        '中立',
        '負面'
    ];


    const values = [
        counts.Positive,
        counts.Neutral,
        counts.Negative
    ];


    const colors = [
        '#4f836d',
        '#89949c',
        '#b86b6b'
    ];


    /*
     * ========================================================
     * 已經存在 Chart：
     * 不 destroy、不重新建立。
     *
     * 直接更新資料。
     * Chart.js 會讓既有 Arc 從目前位置平滑轉換，
     * 所以選中的顏色會自然延伸並填滿整個圓環。
     * ========================================================
     */
    if (
        sentimentChartInstance
    ) {

        sentimentChartInstance.data.labels =
            labels;


        sentimentChartInstance
            .data
            .datasets[0]
            .data =
                values;


        sentimentChartInstance
            .data
            .datasets[0]
            .backgroundColor =
                colors;


        sentimentChartInstance.update();


        return;

    }


    /*
     * ========================================================
     * 第一次進入 Dashboard 時才建立 Chart
     * ========================================================
     */
    sentimentChartInstance =
        new Chart(
            canvas,
            {

                type:
                    'doughnut',

                data: {

                    labels:
                        labels,

                    datasets: [
                        {

                            data:
                                values,

                            backgroundColor:
                                colors,

                            borderWidth:
                                0,

                            hoverBorderWidth:
                                0,

                            hoverOffset:
                                0

                        }
                    ]

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    cutout:
                        '62%',


                    /*
                     * -----------------------------------------
                     * 平滑 Arc transition
                     * -----------------------------------------
                     *
                     * 不重新建立圖表，
                     * 而是讓每個 Arc 的角度直接 tween。
                     */
                    animation: {

                        duration:
                            550,

                        easing:
                            'easeOutCubic'

                    },


                    plugins: {

                        legend: {

                            position:
                                'bottom'

                        },

                        datalabels: {

                            display:
                                false

                        }

                    },


                    /*
                     * 滑鼠移到可點擊區塊時顯示 pointer
                     */
                    onHover:
                        (
                            event,
                            elements
                        ) => {

                            const target =
                                event
                                    ?.native
                                    ?.target;


                            if (
                                target
                            ) {

                                target.style.cursor =

                                    elements.length

                                        ? 'pointer'

                                        : 'default';

                            }

                        },


                    /*
                     * -----------------------------------------
                     * 點擊情緒區塊
                     * -----------------------------------------
                     */
                    onClick:
                        (
                            event,
                            elements
                        ) => {

                            if (
                                !elements.length
                            ) {

                                return;

                            }


                            const index =
                                elements[0].index;


                            /*
                             * 不允許點沒有資料的 Arc
                             */
                            const currentValue =
                                sentimentChartInstance
                                    .data
                                    .datasets[0]
                                    .data[index];


                            if (
                                !currentValue
                            ) {

                                return;

                            }


                            const sentiments = [
                                'Positive',
                                'Neutral',
                                'Negative'
                            ];


                            const selected =
                                sentiments[
                                    index
                                ];


                            /*
                             * 再點同一個：
                             * 取消情緒篩選。
                             *
                             * 點新的：
                             * 套用情緒篩選。
                             */
                            overviewFilters.sentiment =

                                overviewFilters.sentiment
                                ===
                                selected

                                    ? null

                                    : selected;


                            /*
                             * 重新計算 Dashboard。
                             *
                             * drawSentimentChart()
                             * 不會 destroy Chart，
                             * 因此這裡會直接從目前 Arc
                             * 動畫到新的比例。
                             */
                            drawDashboardCharts();

                        }

                }

            }
        );

}

function drawCategoryChart(
    data
) {

    const canvas =
        document.getElementById(
            'categoryChart'
        );


    if (
        !canvas

        ||

        typeof Chart === 'undefined'
    ) {

        return;

    }


    /*
     * ========================================================
     * 固定分類順序
     * ========================================================
     *
     * 重點：
     * 不可以每次篩選後重新用 Object.keys(counts)
     * 決定分類順序。
     *
     * 否則篩選剩下一個分類時，
     * 那個分類就會跑到 index 0，
     * 然後永遠拿到第一個顏色（藍色）。
     */
    const preferredCategoryOrder = [

        '人際關係與管理',

        '工作負載',

        '硬體與環境',

        '其他',

        '薪資福利',

        '職涯發展'

    ];


    /*
     * ========================================================
     * 固定「分類 → 顏色」對應
     * ========================================================
     *
     * 顏色不再依 index 決定，
     * 而是直接和 category 綁定。
     */
    const categoryColorMap = {

        '人際關係與管理':
            '#527187',

        '工作負載':
            '#315da8',

        '硬體與環境':
            '#b38b50',

        '其他':
            '#9c6c78',

        '薪資福利':
            '#75846f',

        '職涯發展':
            '#7d7894',

        '未分類':
            '#98a2b3'

    };


    /*
     * ========================================================
     * 找出整個 Dashboard 真正存在的分類
     * ========================================================
     *
     * 一定使用 baseDashboardData，
     * 而不是目前 filtered data。
     *
     * 這樣即使現在只篩選「工作負載」，
     * Chart 裡其他分類仍然存在，
     * 只是 value 會慢慢變成 0。
     *
     * 因此 Chart.js 可以直接做 Arc transition，
     * 而不是把整張圖重新建立。
     */
    const existingCategories =
        [
            ...new Set(

                baseDashboardData.map(
                    item =>
                        item.category
                        ||
                        '未分類'
                )

            )
        ];


    /*
     * 先依系統既定分類順序排列。
     */
    const labels =
        preferredCategoryOrder.filter(
            category =>
                existingCategories.includes(
                    category
                )
        );


    /*
     * 如果未來資料出現新的分類，
     * 也不會讓圖表直接消失。
     */
    existingCategories.forEach(
        category => {

            if (
                !labels.includes(
                    category
                )
            ) {

                labels.push(
                    category
                );

            }

        }
    );


    /*
     * ========================================================
     * 決定這張圖目前要統計哪批資料
     * ========================================================
     */
    const source =

        lockedCharts.category

            ? globalDashboardData

            : data;


    /*
     * 每個固定分類都先建立 0。
     */
    const counts =
        Object.fromEntries(

            labels.map(
                category => [
                    category,
                    0
                ]
            )

        );


    /*
     * 計算目前篩選範圍中的分類數量。
     */
    source.forEach(
        item => {

            const category =
                item.category
                ||
                '未分類';


            if (
                counts[category]
                === undefined
            ) {

                counts[category] =
                    0;

            }


            counts[category]++;

        }
    );


    /*
     * 重要：
     *
     * labels 永遠維持：
     *
     * 人際關係與管理
     * 工作負載
     * 硬體與環境
     * 其他
     * 薪資福利
     * 職涯發展
     *
     * 即使目前篩選只剩工作負載，
     * data 會變成：
     *
     * [0, 53, 0, 0, 0, 0]
     *
     * 而不是：
     *
     * [53]
     *
     * 因此綠色 Arc 可以從原本的位置
     * 自然延展成整個圓。
     */
    const values =
        labels.map(
            category =>
                counts[category]
                ||
                0
        );


    /*
     * 顏色直接按照分類取得，
     * 不再依陣列位置決定。
     */
    const fallbackColors = [

        '#6f8293',

        '#8d7d65',

        '#6f8b84',

        '#917a84',

        '#7c8396',

        '#718276'

    ];


    const colors =
        labels.map(
            (
                category,
                index
            ) =>

                categoryColorMap[
                    category
                ]

                ||

                fallbackColors[
                    index
                    %
                    fallbackColors.length
                ]

        );


    /*
     * ========================================================
     * 已經存在圖表
     * ========================================================
     *
     * 絕對不要 destroy。
     *
     * 直接修改原本 Chart instance 的資料，
     * Chart.js 就會從目前 Arc 位置做動畫。
     */
    if (
        categoryChartInstance
    ) {

        categoryChartInstance.data.labels =
            labels;


        categoryChartInstance
            .data
            .datasets[0]
            .data =
                values;


        categoryChartInstance
            .data
            .datasets[0]
            .backgroundColor =
                colors;


        /*
         * 使用既有 Arc 做 transition。
         *
         * 例如：
         *
         * 藍 15%
         * 綠 65%
         * 黃 10%
         * ...
         *
         * 點綠色後：
         *
         * 藍 15 → 0
         * 綠 65 → 100
         * 黃 10 → 0
         *
         * 因此綠色會直接從原位置
         * 自然向兩側延伸填滿圓餅。
         */
        categoryChartInstance.update();


        return;

    }


    /*
     * ========================================================
     * 第一次載入才建立 Chart
     * ========================================================
     */
    categoryChartInstance =
        new Chart(
            canvas,
            {

                type:
                    'pie',


                data: {

                    labels:
                        labels,


                    datasets: [
                        {

                            data:
                                values,


                            backgroundColor:
                                colors,


                            borderWidth:
                                0,


                            hoverBorderWidth:
                                0,


                            hoverOffset:
                                0,


                            offset:
                                0

                        }
                    ]

                },


                options: {

                    responsive:
                        true,


                    maintainAspectRatio:
                        false,


                    /*
                     * =================================================
                     * 平滑動畫
                     * =================================================
                     */
                    animation: {

                        duration:
                            550,

                        easing:
                            'easeOutCubic'

                    },


                    plugins: {


                        /*
                         * =============================================
                         * 圖例
                         * =============================================
                         *
                         * 圖例也可以直接點擊篩選。
                         *
                         * 關閉 Chart.js 原本的
                         * hide/show dataset 行為。
                         */
                        legend: {

                            position:
                                'right',


                            onClick:
                                (
                                    event,
                                    legendItem,
                                    legend
                                ) => {

                                    const chart =
                                        legend.chart;


                                    const index =
                                        legendItem.index;


                                    const category =
                                        chart
                                            .data
                                            .labels[
                                                index
                                            ];


                                    if (
                                        !category
                                    ) {

                                        return;

                                    }


                                    globalFilters.category =

                                        globalFilters.category
                                        ===
                                        category

                                            ? null

                                            : category;


                                    syncGlobalFilterControls();


                                    drawDashboardCharts();

                                }

                        },


                        datalabels: {

                            display:
                                false

                        },


                        tooltip: {

                            callbacks: {

                                label:
                                    context => {

                                        const value =
                                            Number(
                                                context.raw
                                                ||
                                                0
                                            );


                                        const total =
                                            context
                                                .dataset
                                                .data
                                                .reduce(
                                                    (
                                                        sum,
                                                        item
                                                    ) =>
                                                        sum
                                                        +
                                                        Number(
                                                            item
                                                            ||
                                                            0
                                                        ),
                                                    0
                                                );


                                        const percentage =

                                            total

                                                ? (
                                                    value
                                                    /
                                                    total
                                                    *
                                                    100
                                                ).toFixed(
                                                    1
                                                )

                                                : '0.0';


                                        return (
                                            `${context.label}: `
                                            +
                                            `${value} 筆 `
                                            +
                                            `(${percentage}%)`
                                        );

                                    }

                            }

                        }

                    },


                    /*
                     * 滑鼠移到真正有資料的 Arc
                     * 才顯示 pointer。
                     */
                    onHover:
                        (
                            event,
                            elements
                        ) => {

                            const target =
                                event
                                    ?.native
                                    ?.target;


                            if (
                                !target
                            ) {

                                return;

                            }


                            target.style.cursor =

                                elements.length

                                    ? 'pointer'

                                    : 'default';

                        },


                    /*
                     * =================================================
                     * 點擊圓餅
                     * =================================================
                     */
                    onClick:
                        (
                            event,
                            elements,
                            chart
                        ) => {

                            if (
                                !elements.length
                            ) {

                                return;

                            }


                            const index =
                                elements[0].index;


                            const category =
                                chart
                                    .data
                                    .labels[
                                        index
                                    ];


                            /*
                             * 沒有 category 就不處理。
                             */
                            if (
                                !category
                            ) {

                                return;

                            }


                            /*
                             * 如果目前還沒有套用 category filter，
                             * 不允許點擊 value = 0 的區域。
                             */
                            const currentValue =
                                Number(
                                    chart
                                        .data
                                        .datasets[0]
                                        .data[
                                            index
                                        ]
                                    ||
                                    0
                                );


                            if (
                                !currentValue

                                &&

                                globalFilters.category
                                !==
                                category
                            ) {

                                return;

                            }


                            /*
                             * 再點同一分類：
                             * 取消篩選。
                             *
                             * 點另外一個分類：
                             * 改成新的分類。
                             */
                            globalFilters.category =

                                globalFilters.category
                                ===
                                category

                                    ? null

                                    : category;


                            /*
                             * drawDashboardCharts()
                             * 會重新計算所有圖表。
                             *
                             * 但是回到 drawCategoryChart() 時，
                             * 因為 categoryChartInstance 已存在，
                             * 不會 destroy。
                             *
                             * 所以只會 update()，
                             * 產生平滑的 Arc transition。
                             */
                            syncGlobalFilterControls();


                            drawDashboardCharts();

                        }

                }

            }
        );

}

function drawDepartmentChart(
    data
) {

    const canvas =
        document.getElementById(
            'deptChart'
        );


    if (
        !canvas

        ||

        typeof Chart === 'undefined'
    ) {

        return;

    }


    const source =

        lockedCharts.dept

            ? globalDashboardData

            : data;


    const departments =
        [
            ...new Set(
                source.map(
                    item =>
                        item.department
                        ||
                        '未提供'
                )
            )
        ];


    const counts =
        {};


    departments.forEach(
        department => {

            counts[department] = {
                Positive: 0,
                Neutral: 0,
                Negative: 0
            };

        }
    );


    source.forEach(
        item => {

            const department =
                item.department
                ||
                '未提供';


            if (
                counts[department]

                &&

                counts[department][item.sentiment]
                !== undefined
            ) {

                counts[department][item.sentiment]++;

            }

        }
    );


    if (
        deptChartInstance
    ) {

        deptChartInstance.destroy();

    }


    deptChartInstance =
        new Chart(
            canvas,
            {

                type:
                    'bar',

                data: {

                    labels:
                        departments,

                    datasets: [

                        {
                            label:
                                '正面',

                            data:
                                departments.map(
                                    department =>
                                        counts[department].Positive
                                ),

                            backgroundColor:
                                '#4f836d'
                        },

                        {
                            label:
                                '中立',

                            data:
                                departments.map(
                                    department =>
                                        counts[department].Neutral
                                ),

                            backgroundColor:
                                '#89949c'
                        },

                        {
                            label:
                                '負面',

                            data:
                                departments.map(
                                    department =>
                                        counts[department].Negative
                                ),

                            backgroundColor:
                                '#b86b6b'
                        }

                    ]

                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    plugins: {

                        datalabels: {
                            display:
                                false
                        }

                    },

                    scales: {

                        x: {
                            stacked:
                                true
                        },

                        y: {

                            stacked:
                                true,

                            beginAtZero:
                                true,

                            ticks: {
                                precision:
                                    0
                            }

                        }

                    },

                    onClick:
                        (
                            event,
                            elements,
                            chart
                        ) => {

                            if (
                                !elements.length
                            ) {

                                return;

                            }


                            const element =
                                elements[0];


                            const department =
                                chart.data.labels[
                                    element.index
                                ];


                            const sentiments = [
                                'Positive',
                                'Neutral',
                                'Negative'
                            ];


                            const sentiment =
                                sentiments[
                                    element.datasetIndex
                                ];


                            const sameSelection =

                                globalFilters.department
                                ===
                                department

                                &&

                                overviewFilters.sentiment
                                ===
                                sentiment;


                            if (
                                sameSelection
                            ) {

                                globalFilters.department =
                                    null;

                                overviewFilters.sentiment =
                                    null;

                            } else {

                                globalFilters.department =
                                    department;

                                overviewFilters.sentiment =
                                    sentiment;

                            }


                            syncGlobalFilterControls();


                            drawDashboardCharts();

                        }

                }

            }
        );

}


/* ==========================================================
   Heatmap
   ========================================================== */

function drawHeatmap(
    data
) {

    const thead =
        document.getElementById(
            'heatmap-thead'
        );


    const tbody =
        document.getElementById(
            'heatmap-tbody'
        );


    if (
        !thead

        ||

        !tbody
    ) {

        return;

    }


    const targetSentiment =
        overviewFilters.sentiment
        ||
        'Negative';


    const targetData =
        data.filter(
            item =>
                item.sentiment
                ===
                targetSentiment
        );


    const departments =
        [
            ...new Set(
                globalDashboardData.map(
                    item =>
                        item.department
                        ||
                        '未提供'
                )
            )
        ].sort();


    const categories =
        [
            ...new Set(
                globalDashboardData.map(
                    item =>
                        item.category
                        ||
                        '未分類'
                )
            )
        ].sort();


    const matrix =
        {};


    let max =
        0;


    departments.forEach(
        department => {

            matrix[department] =
                {};


            categories.forEach(
                category => {

                    matrix[department][category] =
                        0;

                }
            );

        }
    );


    targetData.forEach(
        item => {

            const department =
                item.department
                ||
                '未提供';


            const category =
                item.category
                ||
                '未分類';


            if (
                matrix[department]

                &&

                matrix[department][category]
                !== undefined
            ) {

                matrix[department][category]++;


                max =
                    Math.max(
                        max,
                        matrix[department][category]
                    );

            }

        }
    );


    thead.innerHTML =
        `

            <tr>

                <th>
                    部門 / 議題
                </th>

                ${
                    categories
                        .map(
                            category =>
                                `<th class="text-center">${escapeHtml(category)}</th>`
                        )
                        .join('')
                }

            </tr>

        `;


    tbody.innerHTML =
        '';


    departments.forEach(
        department => {

            const row =
                document.createElement(
                    'tr'
                );


            let html =
                `

                    <td class="fw-bold">
                        ${escapeHtml(department)}
                    </td>

                `;


            categories.forEach(
                category => {

                    const count =
                        matrix[department][category];


                    const opacity =

                        max > 0

                            ? 0.08
                              +
                              (
                                  count
                                  /
                                  max
                              )
                              *
                              0.52

                            : 0;


                    html += `

                        <td
                            class="text-center"
                            style="
                                background:
                                    rgba(
                                        184,
                                        92,
                                        92,
                                        ${opacity}
                                    );
                            "
                        >
                            ${count || '—'}
                        </td>

                    `;

                }
            );


            row.innerHTML =
                html;


            tbody.appendChild(
                row
            );

        }
    );

}


/* ==========================================================
   Word cloud
   ========================================================== */

function drawWordCloud(
    data
) {

    const container =
        document.getElementById(
            'wordcloud-container'
        );


    if (
        !container
    ) {

        return;

    }


    const counts =
        {};


    data.forEach(
        item => {

            normalizeArray(
                item.keywords
            ).forEach(
                keyword => {

                    const text =
                        String(
                            keyword
                        )
                            .trim();


                    if (
                        text
                    ) {

                        counts[text] =
                            (
                                counts[text]
                                ||
                                0
                            )
                            +
                            1;

                    }

                }
            );

        }
    );


    const words =
        Object.entries(
            counts
        )
            .sort(
                (
                    a,
                    b
                ) =>
                    b[1]
                    -
                    a[1]
            )
            .slice(
                0,
                30
            );


    container.innerHTML =
        '';


    if (
        !words.length
    ) {

        container.innerHTML = `

            <span class="text-muted">
                目前沒有足夠的關鍵字資料
            </span>

        `;

        return;

    }


    const maximum =
        words[0][1];


    words.forEach(
        (
            [
                word,
                count
            ]
        ) => {

            const span =
                document.createElement(
                    'span'
                );


            const scale =
                maximum > 1

                    ? count / maximum

                    : 1;


            span.textContent =
                word;


            span.style.fontSize =
                `${14 + scale * 18}px`;


            span.style.opacity =
                String(
                    0.55
                    +
                    scale
                    *
                    0.45
                );


            span.title =
                `${count} 次`;


            container.appendChild(
                span
            );

        }
    );

}


/* ==========================================================
   Trend
   ========================================================== */

const TREND_SENTIMENT_META = {

    Positive: {
        label:
            '正面',

        color:
            '#4f836d'
    },


    Neutral: {
        label:
            '中立',

        color:
            '#89949c'
    },


    Negative: {
        label:
            '負面',

        color:
            '#b86b6b'
    }

};


let trendSelectedSentiments =
    new Set([
        'Positive',
        'Neutral',
        'Negative'
    ]);


let trendChartMode =
    'line';


function getTrendSourceData() {

    /*
     * Trend 仍然遵守：
     *
     * Global scope
     * +
     * Overview sentiment scope
     *
     * 然後才套自己的：
     *
     * Local date
     * Local sentiment visibility
     */
    return getOverviewScopedData(
        getGlobalScopedData()
    );

}


function getTrendAvailableRange() {

    const source =

        globalDashboardData.length

            ? globalDashboardData

            : getGlobalScopedData();


    const dates =
        source
            .map(
                getDashboardDateKey
            )
            .filter(
                Boolean
            )
            .sort();


    if (
        !dates.length
    ) {

        return {
            min:
                null,

            max:
                null
        };

    }


    return {

        min:
            dates[0],

        max:
            dates[
                dates.length - 1
            ]

    };

}


function syncTrendControlState() {

    const buttonMap = {

        Positive:
            'trend-sentiment-positive',

        Neutral:
            'trend-sentiment-neutral',

        Negative:
            'trend-sentiment-negative'

    };


    Object.entries(
        buttonMap
    )
    .forEach(
        (
            [
                sentiment,
                id
            ]
        ) => {

            const button =
                document.getElementById(
                    id
                );


            if (
                !button
            ) {

                return;

            }


            const selected =
                trendSelectedSentiments.has(
                    sentiment
                );


            button.classList.toggle(
                'is-selected',
                selected
            );


            button.setAttribute(
                'aria-pressed',

                selected

                    ? 'true'

                    : 'false'
            );


            /*
             * 只剩一個時提醒：
             * 至少保留一種情緒。
             */
            button.title =

                selected

                &&

                trendSelectedSentiments.size
                ===
                1

                    ? '至少保留一種情緒'

                    : '';

        }
    );


    const lineButton =
        document.getElementById(
            'trend-mode-line'
        );


    const barButton =
        document.getElementById(
            'trend-mode-bar'
        );


    if (
        lineButton
    ) {

        const active =
            trendChartMode
            ===
            'line';


        lineButton.classList.toggle(
            'is-active',
            active
        );


        lineButton.setAttribute(
            'aria-pressed',

            active

                ? 'true'

                : 'false'
        );

    }


    if (
        barButton
    ) {

        const active =
            trendChartMode
            ===
            'bar';


        barButton.classList.toggle(
            'is-active',
            active
        );


        barButton.setAttribute(
            'aria-pressed',

            active

                ? 'true'

                : 'false'
        );

    }

}


function toggleTrendSentiment(
    sentiment
) {

    if (
        !TREND_SENTIMENT_META[
            sentiment
        ]
    ) {

        return;

    }


    if (
        trendSelectedSentiments.has(
            sentiment
        )
    ) {

        /*
         * 不允許全部取消。
         */
        if (
            trendSelectedSentiments.size
            ===
            1
        ) {

            syncTrendControlState();

            return;

        }


        trendSelectedSentiments.delete(
            sentiment
        );

    } else {

        trendSelectedSentiments.add(
            sentiment
        );

    }


    syncTrendControlState();


    drawTrendChart(
        getTrendSourceData()
    );

}


function selectAllTrendSentiments() {

    trendSelectedSentiments =
        new Set([
            'Positive',
            'Neutral',
            'Negative'
        ]);


    syncTrendControlState();


    drawTrendChart(
        getTrendSourceData()
    );

}


function setTrendChartMode(
    mode
) {

    if (
        ![
            'line',
            'bar'
        ].includes(
            mode
        )
    ) {

        return;

    }


    if (
        trendChartMode
        ===
        mode
    ) {

        syncTrendControlState();

        return;

    }


    trendChartMode =
        mode;


    syncTrendControlState();


    drawTrendChart(
        getTrendSourceData()
    );

}


function normalizeTrendDateControls() {

    const startInput =
        document.getElementById(
            'trend-start-date'
        );


    const endInput =
        document.getElementById(
            'trend-end-date'
        );


    const range =
        getTrendAvailableRange();


    if (
        !startInput
        ||
        !endInput
    ) {

        return range;

    }


    if (
        !range.min
        ||
        !range.max
    ) {

        startInput.removeAttribute(
            'min'
        );

        startInput.removeAttribute(
            'max'
        );

        endInput.removeAttribute(
            'min'
        );

        endInput.removeAttribute(
            'max'
        );


        return range;

    }


    [
        startInput,
        endInput
    ]
    .forEach(
        input => {

            input.min =
                range.min;


            input.max =
                range.max;

        }
    );


    const outsideRange =

        (
            endInput.value

            &&

            endInput.value
            <
            range.min
        )

        ||

        (
            startInput.value

            &&

            startInput.value
            >
            range.max
        );


    /*
     * 全域範圍改變後，
     * 如果舊的 Local date 完全不在範圍內，
     * 自動回到目前 Global scope。
     */
    if (
        outsideRange
    ) {

        startInput.value =
            '';


        endInput.value =
            '';


        return range;

    }


    if (
        startInput.value

        &&

        startInput.value
        <
        range.min
    ) {

        startInput.value =
            range.min;

    }


    if (
        endInput.value

        &&

        endInput.value
        >
        range.max
    ) {

        endInput.value =
            range.max;

    }


    if (
        startInput.value

        &&

        endInput.value

        &&

        startInput.value
        >
        endInput.value
    ) {

        const temp =
            startInput.value;


        startInput.value =
            endInput.value;


        endInput.value =
            temp;

    }


    return range;

}


function handleTrendFilterChange() {

    normalizeTrendDateControls();


    drawTrendChart(
        getTrendSourceData()
    );

}


function clearTrendFilters() {

    const startInput =
        document.getElementById(
            'trend-start-date'
        );


    const endInput =
        document.getElementById(
            'trend-end-date'
        );


    if (
        startInput
    ) {

        startInput.value =
            '';

    }


    if (
        endInput
    ) {

        endInput.value =
            '';

    }


    drawTrendChart(
        getTrendSourceData()
    );

}


function setTrendPreset(
    days
) {

    const startInput =
        document.getElementById(
            'trend-start-date'
        );


    const endInput =
        document.getElementById(
            'trend-end-date'
        );


    if (
        !startInput
        ||
        !endInput
    ) {

        return;

    }


    const range =
        normalizeTrendDateControls();


    if (
        !range.min
        ||
        !range.max
    ) {

        return;

    }


    const [
        year,
        month,
        day
    ] =
        range.max
            .split(
                '-'
            )
            .map(
                Number
            );


    const endDate =
        new Date(
            year,
            month - 1,
            day
        );


    const startDate =
        new Date(
            endDate
        );


    startDate.setDate(

        startDate.getDate()

        -

        Math.max(
            Number(days)
            ||
            1,
            1
        )

        +

        1
    );


    const formatDateKey =
        date => {

            const y =
                date.getFullYear();


            const m =
                String(
                    date.getMonth()
                    +
                    1
                )
                .padStart(
                    2,
                    '0'
                );


            const d =
                String(
                    date.getDate()
                )
                .padStart(
                    2,
                    '0'
                );


            return (
                `${y}-${m}-${d}`
            );

        };


    let startKey =
        formatDateKey(
            startDate
        );


    if (
        startKey
        <
        range.min
    ) {

        startKey =
            range.min;

    }


    startInput.value =
        startKey;


    endInput.value =
        range.max;


    drawTrendChart(
        getTrendSourceData()
    );

}


function drawTrendChart(
    data = null
) {

    const canvas =
        document.getElementById(
            'trendChart'
        );


    if (
        !canvas
        ||
        typeof Chart
        ===
        'undefined'
    ) {

        return;

    }


    syncTrendControlState();


    const sourceData =

        Array.isArray(
            data
        )

            ? data

            : getTrendSourceData();


    const range =
        normalizeTrendDateControls();


    const startInput =
        document.getElementById(
            'trend-start-date'
        );


    const endInput =
        document.getElementById(
            'trend-end-date'
        );


    const start =

        startInput?.value

        ||

        range.min

        ||

        '';


    const end =

        endInput?.value

        ||

        range.max

        ||

        '';


    function parseDateKey(
        value
    ) {

        if (
            !value
        ) {

            return null;

        }


        const parts =
            String(
                value
            )
                .slice(
                    0,
                    10
                )
                .replaceAll(
                    '/',
                    '-'
                )
                .split(
                    '-'
                )
                .map(
                    Number
                );


        if (
            parts.length
            !==
            3

            ||

            parts.some(
                item =>
                    !Number.isFinite(
                        item
                    )
            )
        ) {

            return null;

        }


        const date =
            new Date(
                parts[0],
                parts[1] - 1,
                parts[2]
            );


        date.setHours(
            0,
            0,
            0,
            0
        );


        return date;

    }


    function formatDateKey(
        date
    ) {

        const year =
            date.getFullYear();


        const month =
            String(
                date.getMonth()
                +
                1
            )
            .padStart(
                2,
                '0'
            );


        const day =
            String(
                date.getDate()
            )
            .padStart(
                2,
                '0'
            );


        return (
            `${year}-${month}-${day}`
        );

    }


    let minDate =
        parseDateKey(
            start
        );


    let maxDate =
        parseDateKey(
            end
        );


    if (
        !maxDate
    ) {

        maxDate =
            new Date();


        maxDate.setHours(
            0,
            0,
            0,
            0
        );

    }


    if (
        !minDate
    ) {

        minDate =
            new Date(
                maxDate
            );


        minDate.setDate(
            minDate.getDate()
            -
            6
        );

    }


    if (
        minDate
        >
        maxDate
    ) {

        const temp =
            minDate;


        minDate =
            maxDate;


        maxDate =
            temp;

    }


    /*
     * 建立每一天。
     * 沒資料也維持 0，
     * 避免時間軸斷掉。
     */
    const counts =
        {};


    const cursor =
        new Date(
            minDate
        );


    let loopGuard =
        0;


    while (
        cursor
        <=
        maxDate

        &&

        loopGuard
        <
        366
    ) {

        const key =
            formatDateKey(
                cursor
            );


        counts[
            key
        ] = {

            Positive:
                0,

            Neutral:
                0,

            Negative:
                0

        };


        cursor.setDate(
            cursor.getDate()
            +
            1
        );


        loopGuard++;

    }


    sourceData.forEach(
        item => {

            const key =
                getDashboardDateKey(
                    item
                );


            if (
                !key
                ||
                !counts[
                    key
                ]
            ) {

                return;

            }


            if (
                counts[
                    key
                ][
                    item.sentiment
                ]
                !==
                undefined
            ) {

                counts[
                    key
                ][
                    item.sentiment
                ]++;

            }

        }
    );


    const dateKeys =
        Object.keys(
            counts
        )
        .sort();


    const labels =
        dateKeys.map(
            key =>
                key.replaceAll(
                    '-',
                    '/'
                )
        );


    /*
     * Multi-select：
     * 只建立使用者目前勾選的 datasets。
     */
    const selectedSentiments =
        [
            'Positive',
            'Neutral',
            'Negative'
        ]
        .filter(
            sentiment =>
                trendSelectedSentiments.has(
                    sentiment
                )
        );


    const isBar =
        trendChartMode
        ===
        'bar';


    const datasets =
        selectedSentiments.map(
            sentiment => {

                const meta =
                    TREND_SENTIMENT_META[
                        sentiment
                    ];


                const values =
                    dateKeys.map(
                        key =>
                            counts[
                                key
                            ][
                                sentiment
                            ]
                    );


                /*
                 * Stacked bar
                 */
                if (
                    isBar
                ) {

                    return {

                        label:
                            meta.label,

                        data:
                            values,

                        backgroundColor:
                            meta.color,

                        borderColor:
                            meta.color,

                        borderWidth:
                            0,

                        borderRadius:
                            4,

                        borderSkipped:
                            false,

                        maxBarThickness:
                            24,

                        stack:
                            'sentiment'

                    };

                }


                /*
                 * Trend line
                 *
                 * tension 降低，
                 * 避免原本過度彎曲的 S 型線條。
                 */
                return {

                    label:
                        meta.label,

                    data:
                        values,

                    borderColor:
                        meta.color,

                    backgroundColor:
                        meta.color,

                    borderWidth:
                        2.25,

                    pointRadius:
                        2.75,

                    pointHoverRadius:
                        5,

                    pointBorderWidth:
                        0,

                    tension:
                        0.12,

                    fill:
                        false

                };

            }
        );


    const targetType =

        isBar

            ? 'bar'

            : 'line';


    /*
     * 只有切換：
     *
     * Line <-> Bar
     *
     * 才 destroy。
     *
     * 日期 / 情緒篩選
     * 都直接 update()，
     * 避免畫面一直閃。
     */
    if (
        trendChartInstance

        &&

        trendChartInstance.config.type
        !==
        targetType
    ) {

        trendChartInstance.destroy();


        trendChartInstance =
            null;

    }


    if (
        trendChartInstance
    ) {

        trendChartInstance.data.labels =
            labels;


        trendChartInstance.data.datasets =
            datasets;


        trendChartInstance.update();


        return;

    }


    trendChartInstance =
        new Chart(
            canvas,
            {

                type:
                    targetType,


                data: {

                    labels:
                        labels,

                    datasets:
                        datasets

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,


                    animation: {

                        duration:
                            320,

                        easing:
                            'easeOutCubic'

                    },


                    interaction: {

                        mode:
                            'index',

                        intersect:
                            false

                    },


                    plugins: {

                        datalabels: {

                            display:
                                false

                        },


                        legend: {

                            position:
                                'top',


                            labels: {

                                usePointStyle:
                                    true,

                                pointStyle:

                                    isBar

                                        ? 'rectRounded'

                                        : 'circle',

                                boxWidth:
                                    9,

                                boxHeight:
                                    9,

                                padding:
                                    14

                            },


                            /*
                             * 關閉 Chart.js
                             * 預設 Legend Toggle。
                             *
                             * 點「正面」不會再讓正面消失。
                             */
                            onClick:
                                () => {}

                        },


                        tooltip: {

                            callbacks: {

                                title:
                                    items =>

                                        items.length

                                            ? `回饋日期：${items[0].label}`

                                            : '',


                                footer:
                                    items => {

                                        const total =
                                            items.reduce(
                                                (
                                                    sum,
                                                    item
                                                ) =>

                                                    sum

                                                    +

                                                    Number(
                                                        item.raw
                                                        ||
                                                        0
                                                    ),

                                                0
                                            );


                                        return (
                                            `目前顯示合計：${total} 筆`
                                        );

                                    }

                            }

                        }

                    },


                    scales: {

                        x: {

                            stacked:
                                isBar,

                            grid: {

                                display:
                                    false

                            }

                        },


                        y: {

                            stacked:
                                isBar,

                            beginAtZero:
                                true,


                            /*
                             * 回饋數只能是整數。
                             */
                            ticks: {

                                precision:
                                    0,

                                stepSize:
                                    1

                            },


                            grid: {

                                color:
                                    'rgba(16, 24, 40, 0.06)'

                            }

                        }

                    }

                }

            }
        );

}


/* ==========================================================
   Semantic rules
   ========================================================== */

async function loadRules() {

    try {

        const response =
            await fetch(
                '/api/admin/rules'
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            return;

        }


        const tbody =
            document.getElementById(
                'rulesTableBody'
            );


        if (
            !tbody
        ) {

            return;

        }


        tbody.innerHTML =
            '';


        if (
            !result.data.length
        ) {

            tbody.innerHTML = `

                <tr>

                    <td
                        colspan="4"
                        class="
                            text-center
                            text-muted
                            py-5
                        "
                    >
                        尚未建立組織語意參考
                    </td>

                </tr>

            `;

            return;

        }


        result.data.forEach(
            rule => {

                const tr =
                    document.createElement(
                        'tr'
                    );


                const keyword =
                    escapeHtml(
                        rule.keyword
                        ||
                        ''
                    );


                const sentiment =
                    escapeHtml(
                        getSentimentLabel(
                            rule.suggested_sentiment
                        )
                    );


                const category =
                    escapeHtml(
                        rule.suggested_category
                        ||
                        '不指定'
                    );


                tr.innerHTML = `

                    <td>
                        <strong>
                            ${keyword}
                        </strong>
                    </td>


                    <td>
                        <span class="badge bg-secondary">
                            ${sentiment}
                        </span>
                    </td>


                    <td>
                        ${category}
                    </td>


                    <td>

                        <div class="d-flex gap-2">

                            <button
                                type="button"
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-primary
                                "
                                data-action="edit"
                            >
                                修改
                            </button>


                            <button
                                type="button"
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-danger
                                "
                                data-action="delete"
                            >
                                刪除
                            </button>

                        </div>

                    </td>

                `;


                tr.querySelector(
                    '[data-action="edit"]'
                )
                .addEventListener(
                    'click',
                    () => {

                        editRule(
                            rule.id,
                            rule.keyword,
                            rule.suggested_sentiment,
                            rule.suggested_category
                            ||
                            ''
                        );

                    }
                );


                tr.querySelector(
                    '[data-action="delete"]'
                )
                .addEventListener(
                    'click',
                    () => {

                        deleteRule(
                            rule.id
                        );

                    }
                );


                tbody.appendChild(
                    tr
                );

            }
        );


    } catch (error) {

        console.error(
            'loadRules:',
            error
        );

    }

}


function editRule(
    id,
    keyword,
    sentiment,
    category
) {

    editingRuleId =
        id;


    const keywordEl =
        document.getElementById(
            'new-rule-keyword'
        );


    const sentimentEl =
        document.getElementById(
            'new-rule-sentiment'
        );


    const categoryEl =
        document.getElementById(
            'new-rule-category'
        );


    if (
        keywordEl
    ) {

        keywordEl.value =
            keyword
            ||
            '';

    }


    if (
        sentimentEl
    ) {

        sentimentEl.value =
            sentiment
            ||
            'Negative';

    }


    if (
        categoryEl
    ) {

        categoryEl.value =
            category
            ||
            '';

    }


    const submit =
        document.getElementById(
            'rule-submit-btn'
        );


    const cancel =
        document.getElementById(
            'rule-cancel-btn'
        );


    if (
        submit
    ) {

        submit.textContent =
            '儲存修改';

    }


    if (
        cancel
    ) {

        cancel.classList.remove(
            'd-none'
        );

    }

}


function cancelEditRule() {

    editingRuleId =
        null;


    const keywordEl =
        document.getElementById(
            'new-rule-keyword'
        );


    const sentimentEl =
        document.getElementById(
            'new-rule-sentiment'
        );


    const categoryEl =
        document.getElementById(
            'new-rule-category'
        );


    if (
        keywordEl
    ) {

        keywordEl.value =
            '';

    }


    if (
        sentimentEl
    ) {

        sentimentEl.value =
            'Negative';

    }


    if (
        categoryEl
    ) {

        categoryEl.value =
            '';

    }


    const submit =
        document.getElementById(
            'rule-submit-btn'
        );


    const cancel =
        document.getElementById(
            'rule-cancel-btn'
        );


    if (
        submit
    ) {

        submit.textContent =
            '新增';

    }


    if (
        cancel
    ) {

        cancel.classList.add(
            'd-none'
        );

    }

}


async function saveRule() {

    const keyword =
        document.getElementById(
            'new-rule-keyword'
        )?.value
            .trim()
        ||
        '';


    const sentiment =
        document.getElementById(
            'new-rule-sentiment'
        )?.value
        ||
        '';


    const category =
        document.getElementById(
            'new-rule-category'
        )?.value
        ||
        '';


    if (
        !keyword
    ) {

        alert(
            '請輸入企業關鍵字。'
        );

        return;

    }


    try {

        const method =

            editingRuleId

                ? 'PUT'

                : 'POST';


        const url =

            editingRuleId

                ? `/api/admin/rules/${editingRuleId}`

                : '/api/admin/rules';


        const response =
            await fetch(
                url,
                {

                    method:
                        method,

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify(
                            {
                                keyword:
                                    keyword,

                                sentiment:
                                    sentiment,

                                category:
                                    category
                            }
                        )

                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '儲存失敗'
            );

        }


        cancelEditRule();

        await loadRules();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '語意參考儲存失敗。'
        );

    }

}


async function deleteRule(
    id
) {

    if (
        !confirm(
            '確定要刪除這筆語意參考嗎？'
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/rules/${id}`,
                {
                    method:
                        'DELETE'
                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '刪除失敗'
            );

        }


        await loadRules();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '刪除失敗。'
        );

    }

}


/* ==========================================================
   Recycle bin
   ========================================================== */

async function loadRecycleBin() {

    try {

        const response =
            await fetch(
                '/api/admin/recycle'
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            return;

        }


        const tbody =
            document.getElementById(
                'recycleTableBody'
            );


        if (
            !tbody
        ) {

            return;

        }


        tbody.innerHTML =
            '';


        if (
            !result.data.length
        ) {

            tbody.innerHTML = `

                <tr>

                    <td
                        colspan="4"
                        class="
                            text-center
                            text-muted
                            py-5
                        "
                    >
                        回收桶目前沒有資料
                    </td>

                </tr>

            `;

            return;

        }


        result.data.forEach(
            item => {

                const sentimentClass =

                    item.sentiment === 'Positive'

                        ? 'bg-success'

                        : item.sentiment === 'Negative'

                          ? 'bg-danger'

                          : 'bg-secondary';



                const tr =
                    document.createElement(
                        'tr'
                    );


                tr.innerHTML = `

                    <td>

                        <div class="fw-bold">

                            ${escapeHtml(item.deleted_at || '')}

                        </div>


                        <div class="small mt-1">

                            原始時間：

                            ${escapeHtml(item.created_at || '')}

                        </div>


                        <div class="mt-2">

                            <span class="badge bg-info">

                                ${escapeHtml(item.department || '未提供')}

                            </span>

                        </div>

                    </td>



                    <td>

                        <div class="recycle-feedback-preview">

                            ${escapeHtml(item.feedback || '')}

                        </div>


                        <div class="recycle-feedback-hint">

                            復原後可重新查看完整分析

                        </div>

                    </td>



                    <td>

                        <div class="recycle-analysis">

                            <span
                                class="
                                    badge
                                    ${sentimentClass}
                                "
                            >

                                ${escapeHtml(getSentimentLabel(item.sentiment))}

                            </span>


                            <span class="recycle-category">

                                ${escapeHtml(item.category || '未分類')}

                            </span>

                        </div>

                    </td>



                    <td>

                        <div class="recycle-actions">

                            <button
                                type="button"
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-success
                                "
                                data-action="restore"
                            >
                                復原
                            </button>


                            <button
                                type="button"
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-danger
                                "
                                data-action="hard-delete"
                            >
                                永久刪除
                            </button>

                        </div>

                    </td>

                `;


                tr.querySelector(
                    '[data-action="restore"]'
                )
                .addEventListener(
                    'click',
                    () => {

                        restoreFeedback(
                            item.id
                        );

                    }
                );


                tr.querySelector(
                    '[data-action="hard-delete"]'
                )
                .addEventListener(
                    'click',
                    () => {

                        hardDeleteFeedback(
                            item.id
                        );

                    }
                );


                tbody.appendChild(
                    tr
                );

            }
        );


    } catch (error) {

        console.error(
            'loadRecycleBin:',
            error
        );

    }

}


async function restoreFeedback(
    id
) {

    if (
        !confirm(
            '確定要復原這筆回饋嗎？'
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/recycle/${id}/restore`,
                {
                    method:
                        'PUT'
                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '復原失敗'
            );

        }


        await loadRecycleBin();

        await loadFeedbacks();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '復原失敗。'
        );

    }

}


async function hardDeleteFeedback(
    id
) {

    if (
        !confirm(
            '永久刪除後無法復原，確定要繼續嗎？'
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/recycle/${id}`,
                {
                    method:
                        'DELETE'
                }
            );


        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(
                result.error
                ||
                '永久刪除失敗'
            );

        }


        await loadRecycleBin();


    } catch (error) {

        console.error(
            error
        );


        alert(
            '永久刪除失敗。'
        );

    }

}


/* ==========================================================
   DataTable preference
   ========================================================== */

document.addEventListener(
    'change',
    event => {

        if (
            event.target

            &&

            event.target.classList.contains(
                'dataTable-selector'
            )
        ) {

            localStorage.setItem(
                'adminPreferredPageSize',
                event.target.value
            );

        }

    }
);


/* ==========================================================
   Sortable dashboard
   ========================================================== */

function initializeSortable() {

    const container =
        document.getElementById(
            'sortable-charts'
        );


    if (
        !container

        ||

        typeof Sortable === 'undefined'
    ) {

        return;

    }


    Sortable.create(
        container,
        {

            animation:
                180,

            ghostClass:
                'sortable-ghost',

            handle:
                '.drag-handle'

        }
    );

}


/* ==========================================================
   Startup
   ========================================================== */

document.addEventListener(
    'DOMContentLoaded',
    async () => {

        const savedSort =
            localStorage.getItem(
                'adminPreferredSort'
            );


        const sortOrder =
            document.getElementById(
                'sort-order'
            );


        if (
            savedSort

            &&

            sortOrder
        ) {

            sortOrder.value =
                savedSort;

        }


        /*
           回饋管理是新的預設首頁。
        */

        switchTab(
            document.body.dataset.startTab || 'table'
        );


        /*
           先載入回饋資料。
        */

        await loadFeedbacks();


        /*
           Dashboard drag sorting.
        */

        initializeSortable();

    }
);

