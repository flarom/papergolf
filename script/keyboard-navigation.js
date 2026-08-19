(function () {
    const FOCUS_ATTRS = {
        ArrowRight: 'right-focus',
        ArrowLeft: 'left-focus',
        ArrowDown: 'down-focus',
        ArrowUp: 'up-focus',
    };

    function resolveTarget(ref) {
        if (!ref) return null;

        if (ref.startsWith('element:')) {
            const tag = ref.slice(8);
            const active = document.activeElement;
            if (!active) return null;
            const candidates = Array.from(document.querySelectorAll(tag));
            if (!candidates.length) return null;
            const idx = candidates.indexOf(active);
            if (idx !== -1) {
                return smartFocus(candidates[(idx + 1) % candidates.length] || candidates[0]);
            }
            let best = null;
            let bestDist = Infinity;
            const ar = active.getBoundingClientRect();
            for (const el of candidates) {
                const er = el.getBoundingClientRect();
                const dist = Math.hypot(er.left - ar.left, er.top - ar.top);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = el;
                }
            }
            return smartFocus(best);
        }

        const el = document.getElementById(ref);
        if (!el) return null;
        return smartFocus(el);
    }

    function smartFocus(el) {
        const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        if (el.matches(FOCUSABLE)) return el;
        const child = el.querySelector(FOCUSABLE);
        return child || el;
    }

    document.addEventListener('keydown', function (e) {
        const key = e.key;
        const attr = FOCUS_ATTRS[key];
        if (!attr) return;

        const target = document.activeElement;
        if (!target || target === document.body) return;

        const ref = target.getAttribute(attr);
        if (!ref) return;

        const dest = resolveTarget(ref);
        if (!dest) return;

        e.preventDefault();
        dest.focus();
    });

    var originals = new WeakMap();
    var activeContainer = null;

    function applyMnemonics(container) {
        if (activeContainer === container) return;
        cleanup();
        activeContainer = container;

        container.querySelectorAll('[accesskey]').forEach(function (btn) {
            var key = btn.getAttribute('accesskey').toLowerCase();
            var original = btn.textContent;
            originals.set(btn, original);

            var lower = original.toLowerCase();
            var idx = lower.indexOf(key);

            if (idx !== -1) {
                var before = original.slice(0, idx);
                var letter = original.slice(idx, idx + 1);
                var after = original.slice(idx + 1);
                btn.innerHTML = before + '<u>' + letter + '</u>' + after;
            } else {
                btn.textContent = original + ' (' + key + ')';
            }
        });
    }

    function cleanup() {
        if (!activeContainer) return;
        activeContainer.querySelectorAll('[accesskey]').forEach(function (btn) {
            var orig = originals.get(btn);
            if (orig != null) {
                btn.textContent = orig;
                originals.delete(btn);
            }
        });
        activeContainer = null;
    }

    document.addEventListener('focusin', function (e) {
        var btn = e.target.closest('[accesskey]');
        if (btn) {
            applyMnemonics(btn.parentElement);
        }
    });

    document.addEventListener('focusout', function () {
        requestAnimationFrame(function () {
            var next = document.activeElement;
            if (!activeContainer || (next && activeContainer.contains(next))) return;
            cleanup();
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        var key = e.key.toLowerCase();
        if (key.length !== 1) return;

        var container = document.activeElement
            ? document.activeElement.closest('[accesskey]')?.parentElement
            : null;
        if (!container) return;

        var match = container.querySelector('[accesskey="' + key + '"]');
        if (match) {
            e.preventDefault();
            match.click();
        }
    });
})();
