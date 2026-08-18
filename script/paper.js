const params = new URLSearchParams(location.search);

const pages = Math.max(1, Math.min(50, parseInt(params.get('pages') || '1', 10) || 1));
const format = params.get('format') || 'a4';

const FORMATS = {
    a4: { width: 210, height: 297, page: 'A4 portrait' },
    letter: { width: 215.9, height: 279.4, page: 'letter portrait' },
};
const fmt = FORMATS[format] || FORMATS.a4;

const HOLES_PER_PAGE = 6;

function mulliganBalls(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += '<span class="mulligan-ball"></span>';
    }
    return html;
}

function buildSheet() {
    const seed = randomInt(1, 2147483646);
    setSeed(seed);
    const name = generateCourseName();

    const sheet = document.createElement('section');
    sheet.className = 'sheet';
    sheet.style.width = fmt.width + 'mm';
    sheet.style.height = fmt.height + 'mm';

    const heading = document.createElement('div');
    heading.className = 'sheet-heading';
    heading.innerHTML = '<span class="sheet-heading-name">' + name + '</span><span class="sheet-heading-mulligans">' + mulliganBalls(MULLIGANS_PER_COURSE) + '</span>';
    sheet.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'sheet-grid';

    for (let i = 0; i < HOLES_PER_PAGE; i++) {
        const cell = document.createElement('div');
        cell.className = 'field-cell';

        const field = document.createElement('div');
        field.className = 'field';
        renderPaperField(field);

        const footer = document.createElement('div');
        footer.className = 'field-footer';
        footer.innerHTML = 'hole ' + (i + 1) + '<span class="tab"></span>strokes<span class="tab"></span>/' + PAR + '<span class="tab"></span>total:  ';

        cell.appendChild(field);
        cell.appendChild(footer);
        grid.appendChild(cell);
    }

    sheet.appendChild(grid);
    return sheet;
}

document.addEventListener('DOMContentLoaded', () => {
    const info = document.getElementById('paper-info');
    if (info) info.textContent = `${pages} page${pages === 1 ? '' : 's'} · ${fmt.page} · ${HOLES_PER_PAGE} holes each`;

    if (fmt.page !== 'A4 portrait') {
        const style = document.createElement('style');
        style.textContent = `@page { size: ${fmt.page}; margin: 12mm; }`;
        document.head.appendChild(style);
    }

    const sheets = document.getElementById('sheets');
    for (let p = 0; p < pages; p++) sheets.appendChild(buildSheet());

    const printButton = document.getElementById('print');
    if (printButton) printButton.addEventListener('click', () => window.print());

    window.addEventListener('load', () => window.print());
});
