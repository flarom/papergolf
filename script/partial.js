const partial = (() => {
    const cache = {};

    async function fetchPartial(name) {
        if (cache[name]) return cache[name];
        try {
            const res = await fetch(`partial/${name}.part.html`);
            if (!res.ok) throw new Error(`Failed to fetch partial "${name}": ${res.status}`);
            const html = await res.text();
            cache[name] = html;
            return html;
        } catch (err) {
            console.error(err);
            return `<span style="color:red;background:black;">partial "partial/${name}.part.html" failed</span>`;
        }
    }

    async function resolvePartials(root) {
        let tags = root.querySelectorAll("partial");
        while (tags.length > 0) {
            for (const tag of tags) {
                const name = tag.getAttribute("name");
                if (!name) continue;
                const html = await fetchPartial(name);
                tag.outerHTML = html;
            }
            tags = root.querySelectorAll("partial");
        }
    }

    async function update(root) {
        root = root || document;
        await resolvePartials(root);
    }

    return { update };
})();

document.addEventListener("DOMContentLoaded", () => partial.update());
