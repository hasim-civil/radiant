/* ===========================================================================
   Orbit Time — UI layer
   ---------------------------------------------------------------------------
   Presentation only. This file never reads or writes Firebase, never changes
   attendance data, and never renames a DOM id. It observes what the existing
   scripts already render and layers behaviour on top, so attendance.js,
   admin.js, auth.js and leave-holiday.js keep working untouched.

   Load with `defer`, as a classic script, after the page markup.
   GSAP is optional: if window.gsap exists the entrance sequence is
   orchestrated with it, otherwise CSS keyframes carry the same motion.
   =========================================================================== */
(function () {
    'use strict';

    /* -----------------------------------------------------------------------
       Config
       --------------------------------------------------------------------- */
    var THEME_KEY   = 'sa-theme';
    var MOTION_KEY  = 'sa-motion';
    var THEMES      = ['light', 'dark', 'glass'];
    var DEFAULT_THEME = 'light';
    var SHIFT_HOURS = 8;                 /* full working day, for the ring only */
    var DESKTOP_MQ  = window.matchMedia('(min-width: 1024px)');

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
                       localStorage.getItem(MOTION_KEY) === 'off';

    function $(sel, root)  { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    /* =======================================================================
       1. THEME
       The <html data-theme> attribute is set by an inline boot snippet in each
       page's <head> so there is no flash. This only handles switching.
       ===================================================================== */
    var Theme = {
        get: function () {
            var t = document.documentElement.getAttribute('data-theme');
            return THEMES.indexOf(t) > -1 ? t : DEFAULT_THEME;
        },
        set: function (name) {
            if (THEMES.indexOf(name) === -1) name = DEFAULT_THEME;
            document.documentElement.setAttribute('data-theme', name);
            try { localStorage.setItem(THEME_KEY, name); } catch (e) {}
            /* Keeps the Android status bar in step with the app. */
            var meta = $('meta[name="theme-color"]');
            if (meta) {
                meta.setAttribute('content',
                    name === 'light' ? '#FFFFFF' : name === 'dark' ? '#101019' : '#120B2E');
            }
            $$('.theme-switch button').forEach(function (b) {
                b.setAttribute('aria-pressed', String(b.dataset.theme === name));
            });
            document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: name } }));
        },
        mount: function () {
            var host = $('.sidebar-footer');
            if (!host || $('.theme-switch')) return;

            var wrap = document.createElement('div');
            wrap.className = 'theme-switch';
            wrap.setAttribute('role', 'group');
            wrap.setAttribute('aria-label', 'Appearance');

            [
                { id: 'light', icon: 'fa-sun',     label: 'Light theme' },
                { id: 'dark',  icon: 'fa-moon',    label: 'Dark theme' },
                { id: 'glass', icon: 'fa-layer-group', label: 'Glass theme' }
            ].forEach(function (t) {
                var b = document.createElement('button');
                b.type = 'button';
                b.dataset.theme = t.id;
                b.title = t.label;
                b.setAttribute('aria-label', t.label);
                b.setAttribute('aria-pressed', String(Theme.get() === t.id));
                b.innerHTML = '<i class="fas ' + t.icon + '"></i>';
                b.addEventListener('click', function () { Theme.set(t.id); });
                wrap.appendChild(b);
            });

            host.insertBefore(wrap, host.firstChild);
        }
    };

    /* =======================================================================
       2. RIPPLE
       One span per press, positioned at the touch point, removed on end.
       Delegated, so it also covers buttons rendered later by admin.js.
       ===================================================================== */
    function initRipple() {
        if (reduceMotion) return;

        document.addEventListener('pointerdown', function (e) {
            var target = e.target.closest('.btn, .nav-item, .bottom-nav-item, .action-btn, .ampm-btn');
            if (!target || target.disabled) return;

            var rect = target.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height);
            var span = document.createElement('span');
            span.className = 'ripple';
            span.style.width = span.style.height = size + 'px';
            span.style.left = (e.clientX - rect.left - size / 2) + 'px';
            span.style.top  = (e.clientY - rect.top  - size / 2) + 'px';

            /* Buttons already clip; nav items need it applied here. */
            if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
            target.appendChild(span);
            span.addEventListener('animationend', function () { span.remove(); });
        }, { passive: true });
    }

    /* =======================================================================
       3. SIDEBAR + SCRIM
       Drawer on mobile, collapsible rail on desktop.
       ===================================================================== */
    function initSidebar() {
        var sidebar = $('#sidebar');
        if (!sidebar) return;

        var scrim = document.createElement('div');
        scrim.className = 'sidebar-scrim';
        document.body.appendChild(scrim);

        function open() {
            sidebar.classList.add('mobile-open');
            scrim.classList.add('is-visible');
            document.body.style.overflow = 'hidden';
            var first = $('.nav-item', sidebar);
            if (first) first.focus({ preventScroll: true });
        }
        function close() {
            sidebar.classList.remove('mobile-open');
            scrim.classList.remove('is-visible');
            document.body.style.overflow = '';
        }

        var menuBtn = $('#mobileMenuBtn');
        if (menuBtn) {
            menuBtn.setAttribute('aria-label', 'Open navigation');
            menuBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                sidebar.classList.contains('mobile-open') ? close() : open();
            });
        }

        scrim.addEventListener('click', close);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) close();
        });

        /* Any nav choice closes the drawer — the user has arrived. */
        $$('.nav-item', sidebar).forEach(function (item) {
            item.addEventListener('click', function () { if (!DESKTOP_MQ.matches) close(); });
        });

        /* Swipe the drawer closed. */
        var startX = null;
        sidebar.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
        sidebar.addEventListener('touchmove', function (e) {
            if (startX === null) return;
            var dx = e.touches[0].clientX - startX;
            if (dx < -60) { close(); startX = null; }
        }, { passive: true });
        sidebar.addEventListener('touchend', function () { startX = null; }, { passive: true });

        /* Desktop collapse, remembered between visits. */
        var toggle = $('#sidebarToggle');
        if (toggle) {
            if (localStorage.getItem('sa-sidebar') === 'collapsed') sidebar.classList.add('collapsed');
            toggle.setAttribute('aria-label', 'Collapse navigation');
            toggle.addEventListener('click', function () {
                sidebar.classList.toggle('collapsed');
                try {
                    localStorage.setItem('sa-sidebar',
                        sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
                } catch (e) {}
            });
        }

        DESKTOP_MQ.addEventListener('change', function (e) { if (e.matches) close(); });
    }

    /* =======================================================================
       4. BOTTOM NAVIGATION
       Built from the sidebar's own nav items, so the two can never drift apart.
       Caps at five slots: with more sections, the fifth becomes "More" and
       opens the drawer.
       ===================================================================== */
    function initBottomNav() {
        var sidebarNav = $('.sidebar-nav');
        if (!sidebarNav || $('.bottom-nav')) return;

        var sourceItems = $$('.nav-item', sidebarNav);
        if (!sourceItems.length) return;

        var nav = document.createElement('nav');
        nav.className = 'bottom-nav';
        nav.setAttribute('aria-label', 'Primary');

        var indicator = document.createElement('span');
        indicator.className = 'bottom-nav-indicator';
        nav.appendChild(indicator);

        var visible = sourceItems.length > 5 ? sourceItems.slice(0, 4) : sourceItems;
        var built = [];

        visible.forEach(function (src) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bottom-nav-item' + (src.classList.contains('active') ? ' active' : '');
            btn.dataset.section = src.dataset.section || '';

            var icon = src.querySelector('i');
            var label = (src.querySelector('span') || {}).textContent || '';
            /* "My Attendance" reads as "Attendance" in a 64px-wide slot. */
            label = label.replace(/^My\s+/i, '').trim();

            btn.innerHTML = '<i class="' + (icon ? icon.className : 'fas fa-circle') + '"></i>' +
                            '<span>' + label + '</span>';
            btn.addEventListener('click', function () { src.click(); });
            nav.appendChild(btn);
            built.push(btn);
        });

        if (sourceItems.length > 5) {
            var more = document.createElement('button');
            more.type = 'button';
            more.className = 'bottom-nav-item';
            more.innerHTML = '<i class="fas fa-ellipsis"></i><span>More</span>';
            more.addEventListener('click', function () {
                var mb = $('#mobileMenuBtn');
                if (mb) mb.click();
            });
            nav.appendChild(more);
            built.push(more);
        }

        document.body.appendChild(nav);

        function moveIndicator() {
            var active = nav.querySelector('.bottom-nav-item.active');
            if (!active) { indicator.style.width = '0px'; return; }
            indicator.style.width = active.offsetWidth + 'px';
            indicator.style.transform = 'translate3d(' + active.offsetLeft + 'px, 0, 0)';
        }

        /* Mirror the sidebar's active state rather than tracking our own —
           whichever script flips .active, both navs stay in sync. */
        function sync() {
            sourceItems.forEach(function (src, i) {
                var btn = built[i];
                if (btn && i < visible.length) btn.classList.toggle('active', src.classList.contains('active'));
            });
            moveIndicator();
        }

        var mo = new MutationObserver(sync);
        sourceItems.forEach(function (src) {
            mo.observe(src, { attributes: true, attributeFilter: ['class'] });
        });

        window.addEventListener('resize', moveIndicator);
        requestAnimationFrame(sync);
    }

    /* =======================================================================
       5. STICKY TOP BAR
       ===================================================================== */
    function initStickyBar() {
        var bar = $('.top-bar');
        if (!bar) return;
        var ticking = false;
        window.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                bar.classList.toggle('is-stuck', window.scrollY > 8);
                ticking = false;
            });
        }, { passive: true });
    }

    /* =======================================================================
       6. RESPONSIVE TABLES
       Copies each <th> onto the matching <td> as data-label so a row can be
       read as a stacked record below 768px. Re-runs whenever a tbody changes,
       because every table here is filled asynchronously.
       ===================================================================== */
    function labelCells(table) {
        var heads = $$('thead th', table).map(function (th) { return th.textContent.trim(); });
        if (!heads.length) return;
        $$('tbody tr', table).forEach(function (row) {
            $$('td', row).forEach(function (td, i) {
                if (td.hasAttribute('colspan')) return;
                if (heads[i]) td.setAttribute('data-label', heads[i]);
            });
        });
    }

    function initTables() {
        $$('.data-table').forEach(function (table) {
            labelCells(table);
            var body = $('tbody', table);
            if (!body) return;
            var mo = new MutationObserver(function () { labelCells(table); });
            mo.observe(body, { childList: true, subtree: true });
        });
    }

    /* =======================================================================
       7. COUNT-UP
       Numbers that land on screen count toward their value instead of
       snapping. Suffixes are preserved, so "8h" counts to "8h".
       ===================================================================== */
    function countUp(el, to, suffix, decimals) {
        var from = 0;
        var dur = 620;
        var start = null;
        el.dataset.counting = '1';

        function frame(ts) {
            if (start === null) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            /* easeOutCubic — fast start, gentle settle. */
            var eased = 1 - Math.pow(1 - p, 3);
            var val = from + (to - from) * eased;
            el.textContent = (decimals ? val.toFixed(decimals) : Math.round(val)) + suffix;
            if (p < 1) requestAnimationFrame(frame);
            else { el.textContent = (decimals ? to.toFixed(decimals) : to) + suffix; delete el.dataset.counting; }
        }
        requestAnimationFrame(frame);
    }

    function initCountUp() {
        if (reduceMotion) return;

        var SELECTOR = '.stat-info h3, .summary-value, .stat-number';

        function maybeCount(el) {
            if (el.dataset.counting) return;
            var text = (el.textContent || '').trim();
            if (text === el.dataset.lastValue) return;
            el.dataset.lastValue = text;

            var m = text.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
            if (!m) return;
            var value = parseFloat(m[1]);
            if (!isFinite(value) || value === 0) return;
            var decimals = (m[1].split('.')[1] || '').length;
            countUp(el, value, m[2] || '', decimals);
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) { maybeCount(entry.target); io.unobserve(entry.target); }
            });
        }, { threshold: 0.35 });

        function watch(el) {
            io.observe(el);
            new MutationObserver(function () { maybeCount(el); })
                .observe(el, { childList: true, characterData: true, subtree: true });
        }

        $$(SELECTOR).forEach(watch);
    }

    /* =======================================================================
       8. THE SHIFT RING
       Injected into the "Today's Attendance" card. It reads the values
       attendance.js already writes into #checkInTime, #checkOutTime and
       #workingHours, so it needs no data of its own and cannot desynchronise.
       ===================================================================== */
    var Ring = {
        el: null, progress: null, elapsed: null, caption: null, eyebrow: null,
        circumference: 0, timer: null,

        mount: function () {
            var body = $('.action-body');
            if (!body || $('.shift-ring')) return;

            var R = 76;
            this.circumference = 2 * Math.PI * R;

            var wrap = document.createElement('div');
            wrap.className = 'shift-ring';
            wrap.setAttribute('role', 'img');
            wrap.innerHTML =
                '<div class="shift-ring__glow"></div>' +
                '<svg viewBox="0 0 190 190" aria-hidden="true">' +
                    '<circle class="shift-ring__track" cx="95" cy="95" r="' + R + '"></circle>' +
                    '<circle class="shift-ring__progress" cx="95" cy="95" r="' + R + '" ' +
                        'stroke-dasharray="' + this.circumference + '" ' +
                        'stroke-dashoffset="' + this.circumference + '"></circle>' +
                '</svg>' +
                '<div class="shift-ring__center">' +
                    '<span class="ring-eyebrow">Today</span>' +
                    '<span class="ring-elapsed">--:--</span>' +
                    '<span class="ring-caption">Not checked in</span>' +
                '</div>';

            body.insertBefore(wrap, body.firstChild);

            this.el       = wrap;
            this.progress = $('.shift-ring__progress', wrap);
            this.elapsed  = $('.ring-elapsed', wrap);
            this.caption  = $('.ring-caption', wrap);
            this.eyebrow  = $('.ring-eyebrow', wrap);

            this.watch();
            this.update();
        },

        /* Re-read whenever attendance.js rewrites any of the three fields. */
        watch: function () {
            var self = this;
            ['checkInTime', 'checkOutTime', 'workingHours', 'todayStatus'].forEach(function (id) {
                var node = document.getElementById(id);
                if (!node) return;
                new MutationObserver(function () { self.update(); })
                    .observe(node, { childList: true, characterData: true, subtree: true });
            });
        },

        /* "09:30 AM" → minutes since midnight. Returns null on "--:--". */
        parseTime: function (text) {
            if (!text) return null;
            var m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
            if (!m) return null;
            var h = parseInt(m[1], 10);
            var min = parseInt(m[2], 10);
            var mer = (m[3] || '').toUpperCase();
            if (mer === 'PM' && h !== 12) h += 12;
            if (mer === 'AM' && h === 12) h = 0;
            return h * 60 + min;
        },

        setProgress: function (fraction, checkedIn) {
            var f = Math.max(0, Math.min(1, fraction));
            /* Once someone is on the clock the ring must show *something*.
               A flat empty track in the first minutes reads as broken rather
               than as "just started", so it floors at a visible sliver. */
            if (checkedIn && f < 0.018) f = 0.018;
            this.progress.style.strokeDashoffset = String(this.circumference * (1 - f));
        },

        format: function (mins) {
            var h = Math.floor(mins / 60);
            var m = Math.floor(mins % 60);
            return h + ':' + (m < 10 ? '0' : '') + m;
        },

        update: function () {
            if (!this.el) return;

            var inEl  = document.getElementById('checkInTime');
            var outEl = document.getElementById('checkOutTime');
            var inMin  = this.parseTime(inEl  ? inEl.textContent  : '');
            var outMin = this.parseTime(outEl ? outEl.textContent : '');

            clearInterval(this.timer);
            this.el.classList.remove('is-running', 'is-complete');

            if (inMin === null) {
                this.elapsed.textContent = '--:--';
                this.caption.textContent = 'Not checked in';
                this.eyebrow.textContent = 'Today';
                this.setProgress(0);
                this.el.setAttribute('aria-label', 'Not checked in today');
                return;
            }

            if (outMin !== null) {
                var worked = Math.max(0, outMin - inMin);
                this.elapsed.textContent = this.format(worked);
                this.caption.textContent = 'Shift complete';
                this.eyebrow.textContent = 'Worked';
                this.setProgress(worked / (SHIFT_HOURS * 60), true);
                this.el.classList.add('is-complete');
                this.el.setAttribute('aria-label', 'Shift complete, ' + this.format(worked) + ' worked');
                return;
            }

            /* On the clock — tick once a minute, not once a second. A minute is
               the smallest unit anyone reads here, and it keeps the phone idle. */
            var self = this;
            this.el.classList.add('is-running');
            this.eyebrow.textContent = 'On the clock';

            function tick() {
                var now = new Date();
                var nowMin = now.getHours() * 60 + now.getMinutes();
                var worked = Math.max(0, nowMin - inMin);
                self.elapsed.textContent = self.format(worked);
                self.setProgress(worked / (SHIFT_HOURS * 60), true);
                var left = SHIFT_HOURS * 60 - worked;
                self.caption.textContent = left > 0 ? self.format(left) + ' left' : 'Full day reached';
                self.el.setAttribute('aria-label', self.format(worked) + ' worked so far today');
            }
            tick();
            this.timer = setInterval(tick, 60000);
        }
    };

    /* =======================================================================
       9. MODALS
       Backdrop click, Escape, focus trap, and swipe-down to dismiss the sheet.
       The existing open and close handlers keep ownership of .active; this
       only adds the behaviours around it.
       ===================================================================== */
    function initModals() {
        var lastFocused = null;

        function closeModal(modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            if (lastFocused && lastFocused.focus) lastFocused.focus({ preventScroll: true });
        }

        $$('.modal').forEach(function (modal) {
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');

            /* Backdrop only — clicks inside the panel must not close it. */
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal(modal);
            });

            /* Swipe the sheet down. */
            var panel = $('.modal-content', modal);
            if (panel) {
                var startY = null, delta = 0;
                panel.addEventListener('touchstart', function (e) {
                    if (panel.scrollTop > 0) return;
                    startY = e.touches[0].clientY; delta = 0;
                }, { passive: true });
                panel.addEventListener('touchmove', function (e) {
                    if (startY === null) return;
                    delta = e.touches[0].clientY - startY;
                    if (delta > 0) panel.style.transform = 'translate3d(0,' + delta + 'px,0)';
                }, { passive: true });
                panel.addEventListener('touchend', function () {
                    if (startY === null) return;
                    panel.style.transform = '';
                    if (delta > 110) closeModal(modal);
                    startY = null; delta = 0;
                }, { passive: true });
            }

            /* Lock the page behind an open sheet, and trap focus inside it. */
            new MutationObserver(function () {
                var open = modal.classList.contains('active');
                document.body.style.overflow = open ? 'hidden' : '';
                if (open) {
                    lastFocused = document.activeElement;
                    /* The close button sits first in the DOM, but landing on
                       "close" as the opening move is the wrong invitation —
                       prefer the first field the user actually came to fill. */
                    var f = modal.querySelector('input:not([type=hidden]), select, textarea') ||
                            modal.querySelector('.modal-footer .btn');
                    if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60);
                }
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        });

        document.addEventListener('keydown', function (e) {
            var open = $('.modal.active');
            if (!open) return;

            if (e.key === 'Escape') { closeModal(open); return; }

            if (e.key === 'Tab') {
                var f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', open)
                        .filter(function (el) { return el.offsetParent !== null; });
                if (!f.length) return;
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    }

    /* =======================================================================
       10. TOASTS
       auth.js creates and removes them. This adds the exit animation and
       announces them to screen readers.
       ===================================================================== */
    function initToasts() {
        var container = $('#toastContainer');
        if (!container) return;

        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');

        new MutationObserver(function (records) {
            records.forEach(function (r) {
                Array.prototype.forEach.call(r.addedNodes, function (node) {
                    if (!node.classList || !node.classList.contains('toast')) return;
                    /* Fade out shortly before the owning script removes it. */
                    setTimeout(function () { node.classList.add('is-leaving'); }, 2700);
                });
            });
        }).observe(container, { childList: true });
    }

    /* =======================================================================
       11. LOADING OVERLAY
       The existing scripts set display:none directly. Intercepting the style
       change lets the overlay fade instead of vanishing mid-frame.
       ===================================================================== */
    function initLoadingOverlay() {
        var overlay = $('#loadingOverlay');
        if (!overlay) return;

        var mo = new MutationObserver(function () {
            if (overlay.style.display === 'none' && !overlay.dataset.faded) {
                overlay.dataset.faded = '1';
                overlay.style.display = 'flex';
                overlay.classList.add('is-hiding');
                setTimeout(function () {
                    overlay.style.display = 'none';
                    overlay.classList.remove('is-hiding');
                    mo.disconnect();
                    revealPage();
                }, reduceMotion ? 0 : 260);
            }
        });
        mo.observe(overlay, { attributes: true, attributeFilter: ['style'] });
    }

    /* =======================================================================
       12. ENTRANCE SEQUENCE
       One orchestrated wave rather than every card animating on its own.
       GSAP if present, CSS classes otherwise — the result looks the same.
       ===================================================================== */
    var revealed = false;
    function revealPage() {
        if (revealed || reduceMotion) return;
        revealed = true;

        var targets = $$('.content-section.active > *, .auth-card, .hero-photo-content, .feature-card');
        if (!targets.length) return;

        if (window.gsap) {
            window.gsap.from(targets, {
                y: 16, opacity: 0, duration: 0.5, ease: 'power2.out',
                stagger: 0.05, clearProps: 'all'
            });
        } else {
            targets.slice(0, 10).forEach(function (el, i) {
                el.style.animation = 'ds-rise 480ms var(--ease-standard) ' + (i * 45) + 'ms both';
                el.addEventListener('animationend', function () { el.style.animation = ''; }, { once: true });
            });
        }
    }

    /* =======================================================================
       13. SECTION SWITCHING
       The nav scripts toggle .active on sections. Scrolling back to the top on
       every change is the missing half — without it a user lands mid-page.
       ===================================================================== */
    function initSectionScroll() {
        $$('.content-section').forEach(function (section) {
            new MutationObserver(function () {
                if (section.classList.contains('active')) {
                    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
                }
            }).observe(section, { attributes: true, attributeFilter: ['class'] });
        });
    }

    /* =======================================================================
       14. SKELETONS
       Any table still showing its "Loading..." placeholder gets skeleton rows
       instead, so the wait has shape.
       ===================================================================== */
    function initSkeletons() {
        $$('.data-table tbody').forEach(function (body) {
            var cell = body.querySelector('td[colspan]');
            if (!cell || !/loading/i.test(cell.textContent)) return;

            var cols = parseInt(cell.getAttribute('colspan'), 10) || 4;
            cell.innerHTML = '';
            cell.style.padding = '0';
            for (var i = 0; i < 4; i++) {
                var row = document.createElement('div');
                row.className = 'skeleton skeleton-row';
                row.style.opacity = String(1 - i * 0.18);
                cell.appendChild(row);
            }
            cell.setAttribute('aria-label', 'Loading records');
            void cols;
        });
    }

    /* =======================================================================
       15. ACCESSIBILITY EXTRAS
       ===================================================================== */
    function initA11y() {
        var main = $('.main-content') || $('.landing-container') || $('.auth-container');
        if (main && !$('.skip-link')) {
            if (!main.id) main.id = 'main';
            var skip = document.createElement('a');
            skip.className = 'skip-link';
            skip.href = '#' + main.id;
            skip.textContent = 'Skip to content';
            document.body.insertBefore(skip, document.body.firstChild);
            main.setAttribute('tabindex', '-1');
        }

        /* Icon-only controls need a name. */
        [['#passwordToggle', 'Show or hide password'],
         ['#sidebarToggle', 'Collapse navigation'],
         ['.modal-close', 'Close dialog']].forEach(function (pair) {
            $$(pair[0]).forEach(function (el) {
                if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', pair[1]);
            });
        });

        $$('.nav-item').forEach(function (el) {
            el.setAttribute('role', 'tab');
            el.setAttribute('aria-selected', String(el.classList.contains('active')));
            new MutationObserver(function () {
                el.setAttribute('aria-selected', String(el.classList.contains('active')));
            }).observe(el, { attributes: true, attributeFilter: ['class'] });
        });
    }

    /* =======================================================================
       16. GREETING
       "Welcome" is fine at 2pm but reads as filler on a screen someone
       glances at every morning. #greetingWord only exists on dashboard.html.
       ===================================================================== */
    function initGreeting() {
        var word = $('#greetingWord');
        if (!word) return;
        var h = new Date().getHours();
        word.textContent = h < 5  ? 'Still up'
                          : h < 12 ? 'Good morning'
                          : h < 17 ? 'Good afternoon'
                          : h < 21 ? 'Good evening'
                          : 'Good night';
    }

    /* =======================================================================
       17. AURORA PARALLAX
       Dashboard only. The aurora wash in aurora-theme.css already drifts on
       its own timer; this nudges it toward the cursor as well, via two CSS
       vars (--aurora-px/--aurora-py) that the wash keyframes add into their
       own transform. Desktop pointer only — a touch screen has no cursor to
       track, and reduced-motion users already get the drift itself switched
       off in CSS, so skipping the listener here just saves the event cost.
       ===================================================================== */
    function initAuroraParallax() {
        if (reduceMotion || !document.body.classList.contains('dashboard-page')) return;
        if (!window.matchMedia('(pointer: fine)').matches) return;

        var root = document.documentElement;
        var targetX = 0, targetY = 0, curX = 0, curY = 0;
        var MAX_PX = 22;

        window.addEventListener('pointermove', function (e) {
            targetX = (e.clientX / window.innerWidth  - 0.5) * 2 * MAX_PX;
            targetY = (e.clientY / window.innerHeight - 0.5) * 2 * MAX_PX;
        }, { passive: true });

        (function tick() {
            curX += (targetX - curX) * 0.06;
            curY += (targetY - curY) * 0.06;
            root.style.setProperty('--aurora-px', curX.toFixed(2) + 'px');
            root.style.setProperty('--aurora-py', curY.toFixed(2) + 'px');
            requestAnimationFrame(tick);
        })();
    }

    /* =======================================================================
       18. PUBLIC HELPERS
       Exposed for later phases. Nothing in this phase depends on them.
       ===================================================================== */
    window.SmartUI = {
        theme: Theme,
        setLoading: function (btn, on) {
            if (!btn) return;
            btn.classList.toggle('is-loading', !!on);
            btn.disabled = !!on;
        },
        skeleton: function (el, on) {
            if (el) el.classList.toggle('skeleton', !!on);
        },
        setMotion: function (mode) {
            reduceMotion = mode === 'off';
            document.documentElement.setAttribute('data-motion', mode);
            try { localStorage.setItem(MOTION_KEY, mode); } catch (e) {}
        },
        refreshRing: function () { Ring.update(); }
    };

    /* =======================================================================
       BOOT
       ===================================================================== */
    function boot() {
        if (localStorage.getItem(MOTION_KEY) === 'off') {
            document.documentElement.setAttribute('data-motion', 'off');
        }

        Theme.mount();
        initA11y();
        initRipple();
        initSidebar();
        initBottomNav();
        initStickyBar();
        initTables();
        initSkeletons();
        initCountUp();
        initModals();
        initToasts();
        initLoadingOverlay();
        initSectionScroll();
        initAuroraParallax();
        initGreeting();
        Ring.mount();

        /* Pages without a loading overlay reveal immediately. */
        var overlay = $('#loadingOverlay');
        if (!overlay || overlay.style.display === 'none') revealPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
