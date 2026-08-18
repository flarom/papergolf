(function () {
    function renderDaily() {
        const holder = document.getElementById('daily');
        if (!holder) return;

        const seed = dailySeed();
        setSeed(seed);

        const holes = [];
        for (let i = 0; i < HOLES_PER_COURSE; i++) {
            const rec = generateCourse();
            holes.push(serializeHole(rec));
        }
        const name = generateCourseName();

        const gallery = get();
        const completed = gallery.find((r) => r.seed === seed);

        const pillEl = holder.querySelector('.daily-pill');
        const nameEl = document.getElementById('daily-name');
        const dateEl = document.getElementById('daily-date');
        const playEl = document.getElementById('daily-play');
        const imgEl = document.getElementById('daily-image');

        if (completed) {
            if (pillEl) pillEl.textContent = 'already played';
            if (nameEl) nameEl.textContent = completed.name;
            if (dateEl) {
                const d = new Date(completed.date);
                dateEl.textContent = isNaN(d.getTime()) ? completed.date : d.toLocaleDateString();
            }
            if (playEl) {
                playEl.textContent = 'play again';
                playEl.href = 'play.html?seed=' + seed;
            }

            const perHole = completed.holes.map((h) => (h && h.shots != null ? h.shots : 0));
            const total = perHole.reduce((a, b) => a + b, 0);

            const statsEl = document.createElement('div');
            statsEl.className = 'daily-stats';
            statsEl.innerHTML =
                '<span>total: ' + total + '/' + (PAR * HOLES_PER_COURSE) + '</span>' +
                '<span>per hole: ' + perHole.join(', ') + '</span>' +
                '<span class="daily-mulligans">' + mulliganDots(completed.mulligansLeft) + '</span>';

            const bottomEl = holder.querySelector('.bottom');
            if (bottomEl) bottomEl.insertBefore(statsEl, bottomEl.firstChild);

            if (imgEl) {
                const cv = courseCanvas(completed, { header: false });
                if (cv) {
                    imgEl.src = cv.toDataURL('image/png');
                } else {
                    imgEl.remove();
                }
                imgEl.onclick = null;
                imgEl.style.cursor = 'default';
            }
        } else {
            if (nameEl) nameEl.textContent = name;
            if (dateEl) dateEl.textContent = new Date().toLocaleDateString();
            if (playEl) playEl.href = 'play.html?seed=' + seed;

            if (imgEl) {
                const cv = courseCanvas({ name, number: seed, holes }, { header: false });
                if (cv) {
                    imgEl.src = cv.toDataURL('image/png');
                } else {
                    imgEl.remove();
                    const thumbs = document.createElement('div');
                    thumbs.className = 'course-thumbs';
                    for (const h of holes) {
                        const thumb = document.createElement('div');
                        thumb.className = 'hole-thumb';
                        renderHoleInto(thumb, h);
                        thumbs.appendChild(thumb);
                    }
                    const main = document.getElementById('daily-main');
                    if (main) main.appendChild(thumbs);
                }
                imgEl.onclick = () => {
                    window.location.href = 'play.html?seed=' + seed;
                };
            }
        }
    }

    function get() {
        try {
            const s = typeof localStorage !== 'undefined' ? localStorage : null;
            if (!s) return [];
            return JSON.parse(s.getItem('mg.gallery') || '[]');
        } catch (e) {
            return [];
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderDaily();

        const holder = document.getElementById('gallery');
        if (!holder) return;

        const gallery = get();
        if (!gallery.length) {
            const p = document.createElement('p');
            p.className = 'gallery-empty';
            p.textContent = 'no completed courses yet';
            holder.appendChild(p);
            return;
        }

        for (const rec of gallery) {
            const card = document.createElement('div');
            card.className = 'course-card';

            const cv = courseCanvas(rec);
            if (cv) {
                const img = document.createElement('img');
                img.className = 'course-img';
                img.alt = rec.name;
                img.src = cv.toDataURL('image/png');
                card.appendChild(img);
            } else {
                const thumbs = document.createElement('div');
                thumbs.className = 'course-thumbs';
                for (const h of rec.holes) {
                    const thumb = document.createElement('div');
                    thumb.className = 'hole-thumb';
                    renderHoleInto(thumb, h);
                    thumbs.appendChild(thumb);
                }
                card.appendChild(thumbs);
            }

            const meta = document.createElement('div');
            meta.className = 'course-meta';

            const name = document.createElement('span');
            name.className = 'course-name';
            name.textContent = rec.name;

            const number = document.createElement('span');
            number.className = 'course-number';
            number.textContent = 'course ' + rec.number;

            const seed = document.createElement('span');
            seed.className = 'course-seed';
            seed.textContent = 'seed: ' + rec.seed;

            const mulligans = document.createElement('span');
            mulligans.className = 'course-mulligans';
            mulligans.textContent = 'mulligans left: ' + rec.mulligansLeft;

            const throws = document.createElement('span');
            throws.className = 'course-throws';
            const perHole = rec.holes.map(h => (h && h.path ? Math.max(0, h.path.length - 1) : 0));
            throws.textContent = 'throws: ' + perHole.join(', ');

            const date = document.createElement('span');
            date.className = 'course-date';
            const d = new Date(rec.date);
            date.textContent = isNaN(d.getTime()) ? rec.date : d.toLocaleDateString();

            meta.appendChild(name);
            meta.appendChild(number);
            meta.appendChild(seed);
            meta.appendChild(mulligans);
            meta.appendChild(throws);
            meta.appendChild(date);

            if (cv) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'secondary gallery-copy';
                copyBtn.textContent = 'copy image';
                copyBtn.addEventListener('click', () => copyCanvas(cv, rec.name + '.png'));
                meta.appendChild(copyBtn);
            }

            card.appendChild(meta);
            holder.appendChild(card);
        }
    });
})();
