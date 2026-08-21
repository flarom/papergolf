(function () {
    function perHoleShots(rec) {
        return rec.holes.map((h) => {
            if (h && h.shots != null) return h.shots;
            if (h && h.path) return Math.max(0, h.path.length - 1);
            return 0;
        });
    }

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
                playEl.onclick = () => { window.location.href = 'play.html?seed=' + seed; };
            }

            const perHole = perHoleShots(completed);
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
            if (playEl) playEl.onclick = () => { window.location.href = 'play.html?seed=' + seed; };

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

    function renderCard(card) {
        const rec = card._rec;
        if (!rec || card._rendered) return;
        card._rendered = true;

        const skeleton = card.querySelector('.course-skeleton');
        if (skeleton) skeleton.remove();

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

        const top = document.createElement('div');
        top.className = 'top';

        const name = document.createElement('span');
        name.className = 'course-name';
        name.textContent = rec.name;

        const date = document.createElement('span');
        date.className = 'course-date';
        const d = new Date(rec.date);
        date.textContent = isNaN(d.getTime()) ? rec.date : d.toLocaleDateString();

        top.appendChild(name);
        top.appendChild(date);

        const bottom = document.createElement('div');
        bottom.className = 'bottom';

        const info = document.createElement('span');
        info.className = 'course-info';
        info.textContent = 'course ' + rec.number + ' \u00b7 seed: ' + rec.seed;

        const perHole = perHoleShots(rec);
        const total = perHole.reduce((a, b) => a + b, 0);

        const totalEl = document.createElement('span');
        totalEl.textContent = 'total: ' + total + '/' + (PAR * HOLES_PER_COURSE);

        const throws = document.createElement('span');
        throws.textContent = 'per hole: ' + perHole.join(', ');

        const mulligans = document.createElement('span');
        mulligans.className = 'course-mulligans';
        mulligans.innerHTML = mulliganDots(rec.mulligansLeft);

        bottom.appendChild(info);
        bottom.appendChild(totalEl);
        bottom.appendChild(throws);
        bottom.appendChild(mulligans);

        meta.appendChild(top);
        meta.appendChild(bottom);

        card.appendChild(meta);
    }

    function setupCarousel(holder) {
        const prev = document.getElementById('gallery-prev');
        const next = document.getElementById('gallery-next');
        if (!prev || !next) return;

        const stepSize = () => {
            const card = holder.querySelector('.course-card');
            if (!card) return 340;
            const gap = parseFloat(getComputedStyle(holder).columnGap) || 16;
            return card.getBoundingClientRect().width + gap;
        };

        prev.addEventListener('click', () => holder.scrollBy({ left: -stepSize(), behavior: 'smooth' }));
        next.addEventListener('click', () => holder.scrollBy({ left: stepSize(), behavior: 'smooth' }));

        function update() {
            const maxScroll = holder.scrollWidth - holder.clientWidth;
            const scrollable = maxScroll > 4;
            const canLeft = scrollable && holder.scrollLeft > 4;
            const canRight = scrollable && holder.scrollLeft < maxScroll - 4;

            holder.classList.toggle('can-left', canLeft);
            holder.classList.toggle('can-right', canRight);
            holder.classList.toggle('can-both', canLeft && canRight);
            holder.classList.toggle('no-nav', !scrollable);

            prev.disabled = !canLeft;
            next.disabled = !canRight;
        }

        holder.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
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
            setupCarousel(holder);
            return;
        }

        // lazy rendering: placeholders are created upfront and the expensive
        // canvas generation only happens when a card approaches the viewport
        const io = 'IntersectionObserver' in window
            ? new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    io.unobserve(entry.target);
                    renderCard(entry.target);
                }
            }, { root: holder, rootMargin: '400px' })
            : null;

        for (const rec of gallery) {
            const card = document.createElement('div');
            card.className = 'course-card';
            card._rec = rec;

            const skeleton = document.createElement('div');
            skeleton.className = 'course-skeleton';
            card.appendChild(skeleton);

            holder.appendChild(card);

            if (io) {
                io.observe(card);
            } else {
                renderCard(card);
            }
        }

        setupCarousel(holder);
    });
})();
