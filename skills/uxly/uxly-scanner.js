(function uxlyAnalyze() {
  "use strict";

  // Remove previous overlay highlights
  document.querySelectorAll("[data-uxly-highlight]").forEach((el) => el.remove());

  const IGNORED_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD", "HTML", "BR", "HR",
    "SVG", "PATH", "CIRCLE", "RECT", "LINE", "POLYGON", "POLYLINE", "ELLIPSE",
    "G", "DEFS", "CLIPPATH", "USE", "SYMBOL", "TEXT", "TSPAN",
  ]);

  const EDGE_TOLERANCE = 2;
  const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea"]);
  const INTERACTIVE_ROLES = new Set(["button", "link", "tab", "menuitem", "checkbox", "radio", "switch"]);

  // ─── Utility ──────────────────────────────────────────────

  function isVisible(el) {
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    return true;
  }

  let _uxlyIdCounter = 0;
  function getSelector(el) {
    // Stamp element with a unique ID for reliable lookup
    if (!el.hasAttribute("data-uxly-id")) {
      el.setAttribute("data-uxly-id", String(++_uxlyIdCounter));
    }
    // Build a human-readable label (for display only)
    let label = el.tagName.toLowerCase();
    if (el.className && typeof el.className === "string") {
      const cls = el.className.trim().split(/\s+/).slice(0, 2).map(c => "." + CSS.escape(c)).join("");
      label += cls;
    }
    return label;
  }

  function getUxlyId(el) {
    return el.getAttribute("data-uxly-id") || "";
  }

  function roundRect(r) {
    return {
      top: Math.round(r.top), left: Math.round(r.left),
      bottom: Math.round(r.bottom), right: Math.round(r.right),
      width: Math.round(r.width), height: Math.round(r.height),
    };
  }

  function rectsOverlapOrAdjacent(a, b, tol) {
    return !(a.right + tol < b.left || b.right + tol < a.left ||
             a.bottom + tol < b.top || b.bottom + tol < a.top);
  }

  function mergeRects(a, b) {
    return {
      top: Math.min(a.top, b.top), left: Math.min(a.left, b.left),
      bottom: Math.max(a.bottom, b.bottom), right: Math.max(a.right, b.right),
      width: Math.max(a.right, b.right) - Math.min(a.left, b.left),
      height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top),
    };
  }

  function median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) return true;
    }
    return false;
  }

  // ─── Color Parsing & WCAG ─────────────────────────────────

  // CIE Lab → sRGB conversion
  function labToRgb(L, a, b) {
    // Lab → XYZ (D65 white point)
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    const delta = 6 / 29;
    const d3 = delta * delta * delta;
    const xn = 0.95047, yn = 1.0, zn = 1.08883;
    const X = xn * (fx > delta ? fx * fx * fx : 3 * delta * delta * (fx - 4 / 29));
    const Y = yn * (fy > delta ? fy * fy * fy : 3 * delta * delta * (fy - 4 / 29));
    const Z = zn * (fz > delta ? fz * fz * fz : 3 * delta * delta * (fz - 4 / 29));
    // XYZ → linear sRGB
    let rLin =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    let gLin = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
    let bLin =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    const gamma = (x) => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return {
      r: Math.round(Math.min(255, Math.max(0, gamma(rLin) * 255))),
      g: Math.round(Math.min(255, Math.max(0, gamma(gLin) * 255))),
      b: Math.round(Math.min(255, Math.max(0, gamma(bLin) * 255))),
    };
  }

  // oklch → sRGB conversion (pure math, no DOM dependency)
  function oklchToRgb(L, C, H) {
    // oklch → oklab
    const hRad = (H * Math.PI) / 180;
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);
    // oklab → linear RGB via LMS
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    let rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    // linear → sRGB gamma
    const gamma = (x) => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return {
      r: Math.round(Math.min(255, Math.max(0, gamma(rLin) * 255))),
      g: Math.round(Math.min(255, Math.max(0, gamma(gLin) * 255))),
      b: Math.round(Math.min(255, Math.max(0, gamma(bLin) * 255))),
    };
  }

  const _parseColorCache = new Map();
  function parseColor(str) {
    if (!str) return null;
    let m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (m) return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]) };
    m = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m) return { r: parseFloat(m[1]) * 255, g: parseFloat(m[2]) * 255, b: parseFloat(m[3]) * 255 };
    // oklch(L C H) or oklch(L C H / alpha)
    m = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m) return oklchToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    // lab(L a b) or lab(L a b / alpha) — CIE Lab, L: 0-100
    m = str.match(/lab\(\s*([\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
    if (m) return labToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    // Fallback: resolve via canvas for hsl, hwb, lab, lch, etc.
    if (_parseColorCache.has(str)) return _parseColorCache.get(str);
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.fillStyle = str;
      const hex = ctx.fillStyle;
      m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      const result = m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
      _parseColorCache.set(str, result);
      return result;
    } catch (e) {
      return null;
    }
  }

  function colorDistance(c1, c2) {
    const dr = c1.r - c2.r, dg = c1.g - c2.g, db = c1.b - c2.b;
    return Math.sqrt(dr * dr * 2 + dg * dg * 4 + db * db * 3);
  }

  function isTransparent(str) {
    if (!str) return true;
    if (str === "transparent" || str === "rgba(0, 0, 0, 0)") return true;
    const m = str.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
    if (m && parseFloat(m[1]) === 0) return true;
    const m2 = str.match(/\/\s*([\d.]+)\s*\)/);
    if (m2 && parseFloat(m2[1]) === 0) return true;
    return false;
  }

  function sRGBtoLinear(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function relativeLuminance(rgb) {
    return 0.2126 * sRGBtoLinear(rgb.r) + 0.7152 * sRGBtoLinear(rgb.g) + 0.0722 * sRGBtoLinear(rgb.b);
  }

  function contrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function parseAlpha(str) {
    if (!str) return 1;
    let m = str.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
    if (m) return parseFloat(m[1]);
    m = str.match(/\/\s*([\d.]+)\s*\)/);
    if (m) return parseFloat(m[1]);
    return 1;
  }

  function compositeOver(fg, fgAlpha, bg) {
    const a = fgAlpha;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
    };
  }

  function getEffectiveBackgroundColor(el) {
    // Walk up the tree collecting backgrounds, then composite from bottom up
    const layers = [];
    let current = el;
    while (current) {
      const bg = getComputedStyle(current).backgroundColor;
      if (bg && !isTransparent(bg)) {
        const parsed = parseColor(bg);
        if (parsed) {
          const alpha = parseAlpha(bg);
          if (alpha >= 0.99) {
            // Fully opaque — no need to go further
            layers.push({ color: parsed, alpha: 1 });
            break;
          }
          layers.push({ color: parsed, alpha });
        }
      }
      current = current.parentElement;
    }

    // Start from white (page default) and composite each layer on top
    let result = { r: 255, g: 255, b: 255 };
    for (let i = layers.length - 1; i >= 0; i--) {
      result = compositeOver(layers[i].color, layers[i].alpha, result);
    }
    return result;
  }

  // ─── Collect Elements ─────────────────────────────────────

  function collectElements() {
    const all = document.body.querySelectorAll("*");
    const elements = [];

    for (const el of all) {
      if (IGNORED_TAGS.has(el.tagName)) continue;
      if (!isVisible(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const cs = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");

      elements.push({
        el, tag,
        rect: roundRect(rect),
        styles: {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          paddingTop: cs.paddingTop,
          paddingRight: cs.paddingRight,
          paddingBottom: cs.paddingBottom,
          paddingLeft: cs.paddingLeft,
          marginTop: cs.marginTop,
          marginRight: cs.marginRight,
          marginBottom: cs.marginBottom,
          marginLeft: cs.marginLeft,
          borderTopWidth: cs.borderTopWidth,
          borderTopColor: cs.borderTopColor,
          borderTopStyle: cs.borderTopStyle,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          textOverflow: cs.textOverflow,
          zIndex: cs.zIndex,
          position: cs.position,
          display: cs.display,
        },
        selector: getSelector(el),
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        isInteractive: INTERACTIVE_TAGS.has(tag) ||
          INTERACTIVE_ROLES.has(role) ||
          el.hasAttribute("tabindex"),
      });
    }
    return elements;
  }

  // ─── Consistency Analysis ─────────────────────────────────

  function classifyRole(item) {
    const t = item.tag;
    const el = item.el;
    const role = el.getAttribute("role");
    if (t === "button" || role === "button" || el.type === "button" || el.type === "submit") return "button";
    if (t === "a") return "link";
    if (t === "input" || t === "textarea" || role === "textbox") return "input";
    if (t === "select" || role === "listbox" || role === "combobox") return "select";
    if (/^h[1-6]$/.test(t)) return t;
    if (t === "p" || t === "span" || t === "li" || t === "td" || t === "label") return "text";
    if (t === "img" || t === "picture" || t === "video") return "media";
    if (t === "table") return "table";
    return null;
  }

  // Normalize CSS values before comparison to reduce false positives
  function normalizeValue(prop, value, item) {
    if (!value) return value;

    // Normalize font-family: case-insensitive, trim quotes
    if (prop === "fontFamily") {
      return value.toLowerCase().replace(/['"]/g, "");
    }

    // Normalize border-radius: treat percentage circles and large px as "pill/circle" category
    if (prop === "borderRadius") {
      if (value === "50%") return "50%"; // circle
      const px = parseFloat(value);
      if (px >= 999) return "pill"; // 9999px, 100px for pill shapes → same bucket
      return value;
    }

    // Skip border color/width when border-style is none — invisible borders aren't inconsistent
    if ((prop === "borderTopColor" || prop === "borderTopWidth") &&
        item && item.styles.borderTopStyle === "none") {
      return "__no-border__";
    }

    return value;
  }

  // Classify button sub-type to allow intentional variants
  function classifyButtonVariant(item) {
    const bg = item.styles.backgroundColor;
    const hasText = hasDirectText(item.el);
    const isSmall = item.rect.width < 44 && item.rect.height < 44;

    if (isTransparent(bg) && !hasText) return "icon-button";
    if (isTransparent(bg)) return "ghost-button";
    return "filled-button";
  }

  // Classify link sub-type by context
  function classifyLinkContext(item) {
    const ancestor = item.el.closest("nav, header, footer, [role=navigation], [role=banner], [role=contentinfo]");
    if (ancestor) {
      const tag = ancestor.tagName.toLowerCase();
      const role = ancestor.getAttribute("role");
      if (tag === "nav" || role === "navigation") return "nav-link";
      if (tag === "footer" || role === "contentinfo") return "footer-link";
      if (tag === "header" || role === "banner") return "header-link";
    }
    return "body-link";
  }

  // Classify heading sub-type by landmark context
  function classifyHeadingContext(item) {
    const tag = item.tag; // h1, h2, etc.
    const landmark = item.el.closest("nav, aside, header, footer, [role=navigation], [role=complementary], [role=banner], [role=contentinfo]");
    if (landmark) {
      const lt = landmark.tagName.toLowerCase();
      const lr = landmark.getAttribute("role");
      if (lt === "nav" || lr === "navigation") return `nav-${tag}`;
      if (lt === "aside" || lr === "complementary") return `sidebar-${tag}`;
      if (lt === "header" || lr === "banner") return `header-${tag}`;
      if (lt === "footer" || lr === "contentinfo") return `footer-${tag}`;
    }
    return tag;
  }

  function analyzeConsistency(elements) {
    const groups = {};
    for (const item of elements) {
      const role = classifyRole(item);
      if (!role) continue;

      // Sub-group buttons, links, and headings by variant/context
      let key = role;
      if (role === "button") key = classifyButtonVariant(item);
      else if (role === "link") key = classifyLinkContext(item);
      else if (/^h[1-6]$/.test(role)) key = classifyHeadingContext(item);

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    const report = {};
    const propsToCheck = [
      "color", "backgroundColor", "fontFamily", "fontSize", "fontWeight",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderRadius", "borderTopWidth", "borderTopColor", "borderTopStyle", "boxShadow",
    ];

    for (const [role, items] of Object.entries(groups)) {
      if (items.length < 2) continue;
      const properties = {};

      for (const prop of propsToCheck) {
        const counts = {};
        for (const item of items) {
          const val = normalizeValue(prop, item.styles[prop], item);
          counts[val] = (counts[val] || 0) + 1;
        }

        // Remove the synthetic no-border bucket from display
        delete counts["__no-border__"];

        const variants = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => ({ value, count }));

        if (variants.length === 0) {
          properties[prop] = { variants: [], dominant: "", totalElements: items.length, isConsistent: true };
        } else {
          properties[prop] = {
            variants,
            dominant: variants[0].value,
            totalElements: items.length,
            isConsistent: variants.length <= 1,
          };
        }
      }

      const inconsistentCount = Object.values(properties).filter((p) => !p.isConsistent).length;
      report[role] = {
        elementCount: items.length,
        properties,
        inconsistentCount,
        severity: inconsistentCount === 0 ? "ok" : inconsistentCount <= 3 ? "warn" : "error",
      };
    }
    return report;
  }

  // ─── Visual Unit Detection (Union-Find) ───────────────────

  class UnionFind {
    constructor(n) {
      this.parent = Array.from({ length: n }, (_, i) => i);
      this.rank = new Array(n).fill(0);
    }
    find(x) {
      if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
      return this.parent[x];
    }
    union(a, b) {
      const ra = this.find(a), rb = this.find(b);
      if (ra === rb) return;
      if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
      else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
      else { this.parent[rb] = ra; this.rank[ra]++; }
    }
  }

  function hasContinuousBorder(el) {
    const cs = getComputedStyle(el);
    const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderRightWidth) +
               parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth);
    if (bw > 0 && cs.borderTopStyle !== "none") return true;
    const bg = cs.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return true;
    if (cs.boxShadow && cs.boxShadow !== "none") return true;
    if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") return true;
    return false;
  }

  function isAncestor(a, b) {
    let node = b.parentElement;
    while (node) {
      if (node === a) return true;
      node = node.parentElement;
    }
    return false;
  }

  function rectContains(outer, inner) {
    return inner.left >= outer.left - 2 && inner.right <= outer.right + 2 &&
           inner.top >= outer.top - 2 && inner.bottom <= outer.bottom + 2;
  }

  function rectArea(r) { return r.width * r.height; }

  function detectVisualUnits(elements) {
    const LANDMARK_TAGS = new Set(["header", "footer", "nav", "aside", "main", "section", "article"]);
    const LANDMARK_ROLES = new Set(["banner", "main", "contentinfo", "navigation", "complementary", "region", "dialog", "alertdialog", "toolbar", "menu", "menubar", "tablist", "tabpanel", "form"]);

    // Step 1: Identify component boundaries — elements that define a visual unit
    // Each becomes its own component (no union-find merging)
    const allUnits = [];

    for (const item of elements) {
      const hasBorder = hasContinuousBorder(item.el);
      const role = item.el.getAttribute("role");
      const isLandmark = LANDMARK_TAGS.has(item.tag) || (role && LANDMARK_ROLES.has(role));
      const hasBg = !isTransparent(item.styles.backgroundColor);

      // A component boundary needs a visual or semantic boundary
      const isComponent = isLandmark || (hasBorder && item.rect.width >= 40 && item.rect.height >= 30);
      // Also include elements with background that contain other elements (cards, panels)
      const isContainer = hasBg && !hasBorder && item.el.children.length >= 2 &&
                          item.rect.width >= 60 && item.rect.height >= 40;

      if (!isComponent && !isContainer) continue;

      // Count elements inside this component
      const members = elements.filter((m) => item.el === m.el || item.el.contains(m.el));

      allUnits.push({
        type: classifyComponent(members, item.rect),
        rect: item.rect,
        memberCount: members.length,
        selector: item.selector,
        uxlyId: getUxlyId(item.el),
        members: members.slice(0, 20).map((m) => ({ tag: m.tag, selector: m.selector, rect: m.rect })),
        outerElement: item.el,
        children: [],
        parent: null,
      });
    }

    if (allUnits.length === 0) return [];

    // Step 2: Build containment tree — sort by area ascending (smallest first)
    allUnits.sort((a, b) => rectArea(a.rect) - rectArea(b.rect));

    for (let i = 0; i < allUnits.length; i++) {
      // Find the smallest larger unit that contains this one in the DOM
      for (let j = i + 1; j < allUnits.length; j++) {
        if (rectContains(allUnits[j].rect, allUnits[i].rect) &&
            allUnits[j].outerElement.contains(allUnits[i].outerElement)) {
          allUnits[i].parent = allUnits[j];
          allUnits[j].children.push(allUnits[i]);
          break; // First match is smallest (sorted by area)
        }
      }
    }

    // Step 3: Compute own member counts (exclude members claimed by children)
    for (const unit of allUnits) {
      const childMemberTotal = unit.children.reduce((sum, c) => sum + c.memberCount, 0);
      unit.ownMemberCount = Math.max(0, unit.memberCount - childMemberTotal);
    }

    // Step 4: Return only root-level units, sorted by position
    return allUnits
      .filter((u) => !u.parent)
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  }

  // ─── Component Classification ─────────────────────────────

  function classifyComponent(members, groupRect) {
    const tags = new Set(members.map((m) => m.tag));
    const roles = new Set(members.map((m) => m.el.getAttribute("role")).filter(Boolean));
    const types = new Set(members.filter((m) => m.el.type).map((m) => m.el.type));

    const isLargeGroup = groupRect && (groupRect.width > 500 || groupRect.height > 500 || members.length > 10);

    // Landmark/container types take priority when the group is large
    if (roles.has("navigation") || tags.has("nav")) return "navigation";
    if (roles.has("dialog") || roles.has("alertdialog")) return "dialog";
    if (roles.has("toolbar")) return "toolbar";
    if (roles.has("menu") || roles.has("menubar")) return "menu";
    if (roles.has("tablist")) return "tab-bar";
    if (tags.has("table") || roles.has("grid") || roles.has("table")) return "table";

    // For large groups, use spatial/semantic heuristics instead of generic "container"
    if (isLargeGroup) {
      if (tags.has("ul") || tags.has("ol")) return "list";

      // Check semantic tags — but only if the semantic element is the dominant member
      // (covers >60% of the group's area), not just a small child
      const groupArea = groupRect.width * groupRect.height;
      const semanticChecks = [
        [["header"], ["banner"], "header"],
        [["footer"], ["contentinfo"], "footer"],
        [["aside"], ["complementary"], "sidebar"],
        [["main"], ["main"], "main-content"],
        [["form"], [], "form"],
        [["article"], [], "article"],
        [["section"], ["region"], "section"],
      ];
      for (const [semTags, semRoles, label] of semanticChecks) {
        const match = members.find((m) =>
          semTags.includes(m.tag) || (semRoles.length && semRoles.includes(m.el.getAttribute("role")))
        );
        if (match) {
          const memberArea = match.rect.width * match.rect.height;
          if (memberArea > groupArea * 0.6) return label;
        }
      }

      // Spatial heuristics based on position and aspect ratio
      return classifyByLayout(groupRect, members);
    }

    // Small/focused groups — classify by content
    if (tags.has("input") || tags.has("textarea") || roles.has("textbox")) {
      if (members.some((m) => m.tag === "button" || m.el.getAttribute("role") === "button")) return "input-group";
      if (types.has("checkbox")) return "checkbox";
      if (types.has("radio")) return "radio";
      if (types.has("range")) return "slider";
      if (types.has("search")) return "search-input";
      return "text-input";
    }
    if (tags.has("select") || roles.has("listbox") || roles.has("combobox")) return "dropdown";
    if (roles.has("progressbar")) return "progress-bar";
    if (roles.has("switch") || roles.has("toggle")) return "toggle";
    if (tags.has("button") || roles.has("button")) return members.length > 2 ? "button-group" : "button";
    if (tags.has("a")) return members.length >= 3 ? "link-list" : "link";
    if (tags.has("img") || tags.has("picture") || tags.has("video")) {
      if (members.some((m) => ["p", "span", "h1", "h2", "h3"].includes(m.tag))) return "card";
      return "media";
    }
    if (tags.has("ul") || tags.has("ol")) return "list";
    if (members.length >= 3) return classifyByLayout(groupRect, members);
    if (members.length === 1 && hasContinuousBorder(members[0].el)) return "panel";
    return classifyByLayout(groupRect, members);
  }

  function classifyByLayout(rect, members) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const widthRatio = rect.width / vw;
    const heightRatio = rect.height / vh;
    const aspectRatio = rect.width / Math.max(rect.height, 1);
    const atTop = rect.top < 10;
    const atBottom = rect.bottom > vh - 10;
    const atLeft = rect.left < 10;
    const atRight = rect.right > vw - 10;
    const spansFullWidth = widthRatio > 0.85;
    const spansFullHeight = heightRatio > 0.7;

    // Top navbar / header bar: wide, short, pinned to top
    if (atTop && spansFullWidth && rect.height < 80) return "top-bar";
    if (atTop && spansFullWidth && rect.height < 200) return "header";

    // Footer: wide, short, pinned to bottom
    if (atBottom && spansFullWidth && rect.height < 200) return "footer";

    // Sidebar: tall, narrow, anchored to left or right edge
    if (spansFullHeight && rect.width < 350 && (atLeft || atRight)) return "sidebar";

    // Main content area: large, not at edges, or the dominant center area
    if (widthRatio > 0.5 && heightRatio > 0.5) {
      // If it doesn't touch left edge, it's probably the main area next to a sidebar
      if (!atLeft && rect.left > 100) return "main-content";
      if (spansFullWidth) return "main-content";
    }

    // Toolbar: wide, short, but not at very top (below header)
    if (spansFullWidth && rect.height < 60 && rect.top > 40) return "toolbar";

    // Card: medium-sized bordered element, clearly contained
    if (widthRatio < 0.6 && heightRatio < 0.5 && members.length <= 15) {
      const hasVisualBoundary = members.some((m) => {
        const s = m.styles;
        const hasBorder = s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
        const hasBg = !isTransparent(s.backgroundColor);
        const hasShadow = s.boxShadow && s.boxShadow !== "none";
        return hasBorder || hasBg || hasShadow;
      });
      if (hasVisualBoundary) return "card";
    }

    // Panel: single-column vertical layout, reasonably tall
    if (aspectRatio < 0.8 && rect.height > 200) return "panel";

    return "container";
  }

  // ─── Chart Detection ─────────────────────────────────────

  function detectCharts() {
    const CHART_KEYWORDS = /chart|graph|plot|series|axis|legend|tick|grid|recharts|apexcharts|highcharts|d3|vizualization|sparkline/i;
    const svgs = document.querySelectorAll("svg");
    const charts = [];

    for (const svg of svgs) {
      if (!isVisible(svg)) continue;
      const rect = svg.getBoundingClientRect();
      // Charts are large — skip icon-sized SVGs
      if (rect.width < 100 || rect.height < 60) continue;

      let score = 0;

      // Check class/id on SVG or ancestors (up to 3 levels)
      let el = svg;
      for (let i = 0; i < 4 && el; i++) {
        const cls = (el.className && typeof el.className === "string") ? el.className : "";
        const id = el.id || "";
        if (CHART_KEYWORDS.test(cls) || CHART_KEYWORDS.test(id)) { score += 3; break; }
        el = el.parentElement;
      }

      // Check for data attributes with chart keywords
      for (const attr of svg.attributes) {
        if (CHART_KEYWORDS.test(attr.name) || CHART_KEYWORDS.test(attr.value)) { score += 2; break; }
      }

      // Has <text> elements (axis labels, tick marks)
      const textEls = svg.querySelectorAll("text");
      if (textEls.length >= 2) score += 2;
      if (textEls.length >= 6) score += 1; // many labels = likely axis ticks

      // Has many paths/rects/lines (data visualization)
      const shapes = svg.querySelectorAll("path, rect, line, circle, polyline");
      if (shapes.length >= 5) score += 1;
      if (shapes.length >= 15) score += 1;

      // Has <g> groups (chart layers)
      const groups = svg.querySelectorAll("g");
      if (groups.length >= 3) score += 1;

      // Size heuristic: larger SVGs more likely charts
      if (rect.width > 200 && rect.height > 150) score += 1;

      if (score >= 3) {
        charts.push({
          el: svg,
          selector: getSelector(svg),
          rect: roundRect(rect),
          textCount: textEls.length,
          shapeCount: shapes.length,
          confidence: Math.min(score, 10),
        });
      }
    }
    return charts;
  }

  // ─── Analysis: Spacing ────────────────────────────────────

  function analyzeSpacing(elements) {
    const textEls = elements.filter((item) => {
      return ["p", "li", "td", "label", "h1", "h2", "h3", "h4", "h5", "h6", "div"].includes(item.tag) &&
        item.el.childNodes.length > 0 && item.el.textContent.trim().length > 0;
    });
    textEls.sort((a, b) => a.rect.top - b.rect.top);

    const issues = [];
    for (let i = 0; i < textEls.length - 1; i++) {
      const a = textEls[i], b = textEls[i + 1];
      const xOverlap = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      if (xOverlap < Math.min(a.rect.width, b.rect.width) * 0.5) continue;
      if (isAncestor(a.el, b.el) || isAncestor(b.el, a.el)) continue;
      const gap = b.rect.top - a.rect.bottom;
      const avgFontSize = (parseFloat(a.styles.fontSize) + parseFloat(b.styles.fontSize)) / 2;
      if (gap >= 0 && gap < avgFontSize * 0.25 && gap < 4) {
        if (a.tag === "span" || b.tag === "span") continue;
        issues.push({
          elementA: { selector: a.selector, tag: a.tag, fontSize: a.styles.fontSize },
          elementB: { selector: b.selector, tag: b.tag, fontSize: b.styles.fontSize },
          gap: Math.round(gap), avgFontSize: Math.round(avgFontSize),
        });
      }
    }
    return issues;
  }

  // ─── Analysis: WCAG Contrast ──────────────────────────────

  function analyzeContrast(elements) {
    const issues = [];
    for (const item of elements) {
      if (!hasDirectText(item.el)) continue;
      // Skip elements whose visible text is empty/whitespace (e.g. conditional-visibility placeholders)
      const visibleText = item.el.textContent.trim();
      if (!visibleText || visibleText.length === 0) continue;
      // Skip elements that are effectively invisible (near-zero dimensions)
      if (item.rect.width < 2 || item.rect.height < 2) continue;
      const fg = parseColor(item.styles.color);
      if (!fg) continue;
      const bg = getEffectiveBackgroundColor(item.el);
      const ratio = contrastRatio(relativeLuminance(fg), relativeLuminance(bg));
      const fontSize = parseFloat(item.styles.fontSize);
      const fontWeight = parseInt(item.styles.fontWeight) || 400;
      const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
      const required = isLarge ? 3 : 4.5;
      if (ratio < required) {
        issues.push({
          selector: item.selector, tag: item.tag,
          fontSize: item.styles.fontSize, fontWeight: item.styles.fontWeight,
          fgColor: item.styles.color, bgColor: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          ratio: Math.round(ratio * 100) / 100, required, isLarge,
        });
      }
    }
    return issues;
  }

  // ─── Analysis: Tap Targets ────────────────────────────────

  function analyzeTapTargets(elements) {
    const interactive = elements.filter((item) => item.isInteractive);

    // Only flag truly tiny targets (< 24px) — 44px is a mobile guideline, not a desktop rule.
    // 24-44px is noted as info only if there are many.
    const tooSmall = [];
    let smallCount = 0; // 24-44px range
    for (const item of interactive) {
      if (item.rect.width <= 0 || item.rect.height <= 0) continue;
      // Skip textareas and text inputs — they often auto-grow on focus/input
      if (item.tag === "textarea") continue;
      if (item.tag === "input" && (!item.el.type || item.el.type === "text" || item.el.type === "search" || item.el.type === "email" || item.el.type === "url")) {
        // Only skip if one dimension is reasonable (>= 24px) — truly tiny inputs are still flagged
        if (Math.max(item.rect.width, item.rect.height) >= 24) continue;
      }
      const minDim = Math.min(item.rect.width, item.rect.height);
      if (minDim < 24) {
        tooSmall.push({
          selector: item.selector, tag: item.tag,
          width: item.rect.width, height: item.rect.height,
        });
      } else if (minDim < 44) {
        smallCount++;
      }
    }

    const tooCrowded = [];
    interactive.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    for (let i = 0; i < interactive.length; i++) {
      for (let j = i + 1; j < interactive.length; j++) {
        const a = interactive[i], b = interactive[j];
        if (b.rect.top - a.rect.bottom > 60) break;
        const hGap = Math.max(0, Math.max(a.rect.left - b.rect.right, b.rect.left - a.rect.right));
        const vGap = Math.max(0, Math.max(a.rect.top - b.rect.bottom, b.rect.top - a.rect.bottom));
        const gap = Math.max(hGap, vGap);
        if (gap > 0 && gap < 8) {
          // Skip vertically stacked links/items inside nav or sidebar — small vertical gaps are expected
          const isVerticalGap = vGap > 0 && vGap >= hGap;
          const inNav = a.el.closest("nav, aside, [role=navigation], [role=complementary]");
          if (isVerticalGap && inNav) continue;

          tooCrowded.push({
            selectorA: a.selector, selectorB: b.selector, gap: Math.round(gap),
          });
        }
      }
    }
    return { tooSmall, tooCrowded, smallCount };
  }

  // ─── Analysis: Sibling Alignment ──────────────────────────

  function analyzeSiblingAlignment(elements) {
    const byParent = new Map();
    for (const item of elements) {
      const parent = item.el.parentElement;
      if (!parent) continue;
      // Skip SVG internals — parent or child inside an SVG context
      if (parent.closest("svg")) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(item);
    }

    const issues = [];
    for (const [parent, children] of byParent) {
      if (children.length < 2) continue;

      // Check row peers (overlapping Y ranges)
      for (let i = 0; i < children.length; i++) {
        for (let j = i + 1; j < children.length; j++) {
          const a = children[i], b = children[j];
          const minH = Math.min(a.rect.height, b.rect.height);
          const yOverlap = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);

          if (yOverlap >= minH * 0.5) {
            const topDiff = Math.abs(a.rect.top - b.rect.top);
            const bottomDiff = Math.abs(a.rect.bottom - b.rect.bottom);
            const heightDiff = Math.abs(a.rect.height - b.rect.height);
            // Only treat as "centered" if the elements are actually different heights
            // (i.e., one is taller, centered within the other). Same-height elements
            // with matching top+bottom offsets are shifted, not centered.
            const isCentered = heightDiff > 1 && topDiff > 0 && bottomDiff > 0 && Math.abs(topDiff - bottomDiff) <= 1;
            if (topDiff >= 2 && topDiff <= 3 && !isCentered) {
              issues.push({
                parentSelector: getSelector(parent),
                childA: a.selector, childB: b.selector,
                axis: "top", offset: topDiff,
              });
            }
          }

          const minW = Math.min(a.rect.width, b.rect.width);
          const xOverlap = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          if (xOverlap >= minW * 0.5) {
            const leftDiff = Math.abs(a.rect.left - b.rect.left);
            const rightDiff = Math.abs(a.rect.right - b.rect.right);
            const widthDiff = Math.abs(a.rect.width - b.rect.width);
            // Only treat as "centered" if widths differ (one wider, centered within the other)
            const isCentered = widthDiff > 1 && leftDiff > 0 && rightDiff > 0 && Math.abs(leftDiff - rightDiff) <= 1;
            if (leftDiff >= 2 && leftDiff <= 3 && !isCentered) {
              issues.push({
                parentSelector: getSelector(parent),
                childA: a.selector, childB: b.selector,
                axis: "left", offset: leftDiff,
              });
            }
          }
        }
      }
    }
    return issues;
  }

  // ─── Analysis: Repeated Item Gaps ─────────────────────────

  function analyzeRepeatedItemGaps(elements) {
    const byParent = new Map();
    for (const item of elements) {
      const parent = item.el.parentElement;
      if (!parent) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(item);
    }

    const issues = [];
    for (const [parent, children] of byParent) {
      if (children.length < 3) continue;

      // Group by tag
      const byTag = {};
      for (const c of children) {
        if (!byTag[c.tag]) byTag[c.tag] = [];
        byTag[c.tag].push(c);
      }

      for (const [tag, group] of Object.entries(byTag)) {
        if (group.length < 3) continue;

        // Check size similarity (within 20%)
        const avgW = group.reduce((s, c) => s + c.rect.width, 0) / group.length;
        const avgH = group.reduce((s, c) => s + c.rect.height, 0) / group.length;
        const similar = group.filter((c) =>
          Math.abs(c.rect.width - avgW) < avgW * 0.2 &&
          Math.abs(c.rect.height - avgH) < avgH * 0.2
        );
        if (similar.length < 3) continue;

        // Determine layout direction
        const sortedY = [...similar].sort((a, b) => a.rect.top - b.rect.top);
        const sortedX = [...similar].sort((a, b) => a.rect.left - b.rect.left);
        const ySpread = sortedY[sortedY.length - 1].rect.top - sortedY[0].rect.top;
        const xSpread = sortedX[sortedX.length - 1].rect.left - sortedX[0].rect.left;

        const sorted = ySpread >= xSpread ? sortedY : sortedX;
        const isVertical = ySpread >= xSpread;

        const gaps = [];
        for (let i = 0; i < sorted.length - 1; i++) {
          const gap = isVertical
            ? sorted[i + 1].rect.top - sorted[i].rect.bottom
            : sorted[i + 1].rect.left - sorted[i].rect.right;
          gaps.push(gap);
        }

        if (gaps.length < 2) continue;
        const med = median(gaps);
        const maxDev = Math.max(...gaps.map((g) => Math.abs(g - med)));

        // Skip if gaps are huge — these aren't a real list, just same-tag siblings in a layout container
        if (med > 100) continue;
        // Skip if any gap is negative (overlapping items)
        if (gaps.some((g) => g < -5)) continue;
        // Only flag if items are actually adjacent siblings (no other elements between them)
        const allSiblings = Array.from(parent.children);
        const indices = similar.map((s) => allSiblings.indexOf(s.el)).filter((i) => i >= 0).sort((a, b) => a - b);
        const areConsecutive = indices.length >= 3 && indices.every((idx, i) => i === 0 || idx - indices[i - 1] <= 2);
        if (!areConsecutive) continue;

        // Split into consecutive runs — a heading or divider between items means separate groups
        const runs = [];
        let currentRun = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
          const idxA = allSiblings.indexOf(sorted[i - 1].el);
          const idxB = allSiblings.indexOf(sorted[i].el);
          if (idxB - idxA > 1) {
            // Check if the sibling between them is a different tag (heading/divider)
            const between = allSiblings.slice(idxA + 1, idxB);
            const hasDivider = between.some(s => s.tagName.toLowerCase() !== tag);
            if (hasDivider) {
              runs.push(currentRun);
              currentRun = [sorted[i]];
              continue;
            }
          }
          currentRun.push(sorted[i]);
        }
        runs.push(currentRun);

        // Analyze each run independently
        for (const run of runs) {
          if (run.length < 3) continue;
          const runGaps = [];
          for (let i = 0; i < run.length - 1; i++) {
            const g = isVertical
              ? run[i + 1].rect.top - run[i].rect.bottom
              : run[i + 1].rect.left - run[i].rect.right;
            runGaps.push(g);
          }
          const runMed = median(runGaps);
          const runMaxDev = Math.max(...runGaps.map((g) => Math.abs(g - runMed)));
          // Skip if the gap ratio is extreme — not a real repeated list (just mismatched siblings)
          const minGap = Math.min(...runGaps.filter(g => g >= 0));
          const maxGap = Math.max(...runGaps);
          if (maxGap > 0 && maxGap / Math.max(minGap, 1) > 10) continue;
          // Skip if max deviation exceeds 2x the median — gaps vary too wildly
          if (runMed > 0 && runMaxDev > runMed * 2) continue;
          if (runMaxDev > 2 && runMed > 0) {
            issues.push({
              parentSelector: getSelector(parent),
              gaps: runGaps.map(Math.round),
              meanGap: Math.round(runMed),
              maxDeviation: Math.round(runMaxDev),
              childCount: run.length,
              direction: isVertical ? "vertical" : "horizontal",
            });
          }
        }
        // (runs-based analysis above replaces the original single-group check)
      }
    }
    return issues;
  }

  // ─── Analysis: Text Truncation ────────────────────────────

  function analyzeTextTruncation(elements) {
    const issues = [];
    for (const item of elements) {
      if (!hasDirectText(item.el)) continue;
      const s = item.styles;
      const hasHiddenOverflow = s.overflow.includes("hidden") ||
        s.overflowX === "hidden" || s.overflowY === "hidden";
      if (!hasHiddenOverflow) continue;

      const hClipped = item.scrollWidth > item.clientWidth + 1;
      const vClipped = item.scrollHeight > item.clientHeight + 1;
      if (!hClipped && !vClipped) continue;

      issues.push({
        selector: item.selector, tag: item.tag,
        type: s.textOverflow === "ellipsis" ? "ellipsis" : "clipped",
        scrollWidth: item.scrollWidth, clientWidth: item.clientWidth,
        scrollHeight: item.scrollHeight, clientHeight: item.clientHeight,
      });
    }
    return issues;
  }

  // ─── Analysis: Z-Index Issues ─────────────────────────────

  function analyzeZIndex(elements) {
    const excessiveZIndex = [];
    const positioned = [];

    for (const item of elements) {
      const z = parseInt(item.styles.zIndex);
      if (isNaN(z)) continue;
      if (item.styles.position === "static") continue;

      if (z > 100 && !item.isInteractive) {
        // Skip off-canvas elements — likely collapsed sidebars, modals, off-canvas drawers
        if (item.rect.right >= -50 && item.rect.left <= window.innerWidth + 50) {
          excessiveZIndex.push({ selector: item.selector, zIndex: z });
        }
      }
      positioned.push({ ...item, z });
    }

    const blockedInteractive = [];
    const interactiveEls = positioned.filter((p) => p.isInteractive);
    const nonInteractiveEls = positioned.filter((p) => !p.isInteractive && p.z > 0);

    const vw = window.innerWidth;

    for (const interactive of interactiveEls) {
      // Skip elements that are off-canvas horizontally — likely collapsed sidebars, off-canvas drawers
      // (Don't filter vertically — below-the-fold content in scrollable pages should still be checked)
      if (interactive.rect.right < -50 || interactive.rect.left > vw + 50) continue;

      // Skip elements inside overflow:hidden containers that clip them out of view
      let clippedAway = false;
      let ancestor = interactive.el.parentElement;
      while (ancestor && ancestor !== document.body) {
        const as = getComputedStyle(ancestor);
        if (as.overflow === "hidden" || as.overflowX === "hidden" || as.overflowY === "hidden") {
          const ar = ancestor.getBoundingClientRect();
          // If the interactive element is fully outside the clipped ancestor's bounds, skip it
          if (interactive.rect.right < ar.left || interactive.rect.left > ar.right ||
              interactive.rect.bottom < ar.top || interactive.rect.top > ar.bottom) {
            clippedAway = true;
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
      if (clippedAway) continue;

      // Skip tiny or zero-area elements (likely collapsed/hidden)
      if (interactive.rect.width < 5 || interactive.rect.height < 5) continue;

      for (const blocker of nonInteractiveEls) {
        if (blocker.z <= interactive.z) continue;
        // Skip blockers that are off-canvas horizontally
        if (blocker.rect.right < -50 || blocker.rect.left > vw + 50) continue;
        // Skip sticky-positioned blockers — they're meant to cover scrolled content
        if (blocker.styles.position === "sticky") continue;
        // Check if blocker fully covers the interactive element
        if (blocker.rect.left <= interactive.rect.left &&
            blocker.rect.top <= interactive.rect.top &&
            blocker.rect.right >= interactive.rect.right &&
            blocker.rect.bottom >= interactive.rect.bottom) {
          blockedInteractive.push({
            blockedSelector: interactive.selector,
            blockerSelector: blocker.selector,
            blockerZ: blocker.z, interactiveZ: interactive.z,
          });
          break;
        }
      }
    }

    return { excessiveZIndex, blockedInteractive };
  }

  // ─── Analysis: Section Spacing ────────────────────────────

  function analyzeSectionSpacing(elements) {
    const landmarkTags = new Set(["header", "main", "footer", "nav", "aside", "section"]);
    const landmarkRoles = new Set(["region", "banner", "main", "contentinfo", "navigation", "complementary"]);

    const landmarks = elements.filter((item) =>
      landmarkTags.has(item.tag) || landmarkRoles.has(item.el.getAttribute("role"))
    );

    if (landmarks.length < 3) return [];

    landmarks.sort((a, b) => a.rect.top - b.rect.top);

    const gaps = [];
    for (let i = 0; i < landmarks.length - 1; i++) {
      const a = landmarks[i], b = landmarks[i + 1];
      const gap = b.rect.top - a.rect.bottom;
      // Skip side-by-side landmarks (horizontally arranged, not stacked)
      const yOverlap = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      const minH = Math.min(a.rect.height, b.rect.height);
      if (minH > 0 && yOverlap > minH * 0.3) continue;
      // Skip negative gaps (overlapping) and absurdly large gaps (> 200px likely different layout zones)
      if (gap < 0 || gap > 200) continue;

      // Skip structural layout siblings (e.g., nav + aside inside same flex/grid wrapper)
      // These aren't "content sections" — their spacing is part of the app shell layout
      if (a.el.parentElement === b.el.parentElement) {
        const parentDisplay = getComputedStyle(a.el.parentElement).display;
        if (parentDisplay === "flex" || parentDisplay === "grid" || parentDisplay === "inline-flex" || parentDisplay === "inline-grid") continue;
      }
      // Skip parent-child relationships (one landmark wraps another)
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // Skip gaps involving app shell elements (header, nav, footer) in different containers —
      // these are structural layout boundaries, not repeating content sections
      const shellTags = new Set(["header", "nav", "footer"]);
      const aIsShell = shellTags.has(a.el.tagName.toLowerCase()) || a.el.getAttribute("role") === "banner" || a.el.getAttribute("role") === "contentinfo" || a.el.getAttribute("role") === "navigation";
      const bIsShell = shellTags.has(b.el.tagName.toLowerCase()) || b.el.getAttribute("role") === "banner" || b.el.getAttribute("role") === "contentinfo" || b.el.getAttribute("role") === "navigation";
      if ((aIsShell || bIsShell) && a.el.parentElement !== b.el.parentElement) continue;

      gaps.push({
        sectionA: a.selector,
        sectionB: b.selector,
        gap,
      });
    }

    const gapValues = gaps.map((g) => g.gap);
    if (gapValues.length < 2) return [];
    const med = median(gapValues);
    if (med === 0) return [];

    return gaps.filter((g) => Math.abs(g.gap - med) > med * 0.5)
      .map((g) => ({ ...g, gap: Math.round(g.gap), medianGap: Math.round(med) }));
  }

  // ─── Analysis: Icon Consistency ───────────────────────────

  function analyzeIconConsistency() {
    // Collect small SVG/img elements that look like icons
    // Look in interactive elements and also flex containers with text siblings
    const iconEls = document.querySelectorAll([
      "button svg", "a svg", "[role=button] svg",
      "button img", "a img", "[role=button] img",
      // Also standalone icons in flex rows (status messages, icon+text pairs)
      ":is(div, span, li, p) > svg",
      ":is(div, span, li, p) > img",
    ].join(", "));
    const icons = [];

    for (const el of iconEls) {
      // Skip SVGs nested inside other SVGs (chart sub-elements)
      if (el.tagName === "svg" && el.parentElement && el.parentElement.closest("svg")) continue;
      if (el.closest("[data-uxly-highlight]")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.width > 32 || rect.height > 32) continue;
      // Skip images that look like avatars (circular, square aspect ratio)
      if (el.tagName === "IMG") {
        const cs = getComputedStyle(el);
        const br = parseFloat(cs.borderRadius);
        if (br >= Math.min(rect.width, rect.height) / 2 - 1) continue;
      }

      // Determine context region for grouping
      const landmark = el.closest("nav, header, footer, main, aside, section, [role=navigation], [role=banner], [role=contentinfo], table, [role=grid]");
      const context = landmark ? (landmark.tagName.toLowerCase() + ":" + getSelector(landmark)) : "page";

      icons.push({
        el, selector: getSelector(el),
        width: Math.round(rect.width), height: Math.round(rect.height),
        centerY: rect.top + rect.height / 2,
        context,
      });
    }

    if (icons.length < 2) return { inconsistentWithinContext: [], misaligned: [] };

    // Group by context, check consistency within each group
    const byContext = {};
    for (const icon of icons) {
      if (!byContext[icon.context]) byContext[icon.context] = [];
      byContext[icon.context].push(icon);
    }

    const inconsistentWithinContext = [];
    for (const [context, group] of Object.entries(byContext)) {
      if (group.length < 2) continue;

      const sizeCounts = {};
      for (const icon of group) {
        const key = `${icon.width}x${icon.height}`;
        sizeCounts[key] = (sizeCounts[key] || 0) + 1;
      }
      const sorted = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length <= 1) continue;

      const dominant = sorted[0][0];
      const [domW, domH] = dominant.split("x").map(Number);

      for (const icon of group) {
        if (Math.abs(icon.width - domW) > 2 || Math.abs(icon.height - domH) > 2) {
          inconsistentWithinContext.push({
            selector: icon.selector, width: icon.width, height: icon.height,
            dominantSize: dominant, context,
          });
        }
      }
    }

    // Check icon-text vertical alignment (in interactive elements and flex rows)
    const misaligned = [];
    for (const icon of icons) {
      // Look for the nearest row container — button, link, or flex parent
      let parent = icon.el.closest("button, a, [role=button]");
      if (!parent) {
        // Check if icon is in a flex row with text siblings
        const directParent = icon.el.parentElement;
        if (directParent) {
          const display = getComputedStyle(directParent).display;
          if (display === "flex" || display === "inline-flex") parent = directParent;
        }
      }
      if (!parent) continue;
      for (const child of parent.querySelectorAll("span, p, label, div")) {
        if (child.textContent.trim() && !child.contains(icon.el) && child !== icon.el) {
          // Only compare if this child is a text element (not another container with icons)
          if (child.querySelector("svg, img")) continue;
          const tRect = child.getBoundingClientRect();
          if (tRect.width < 1 || tRect.height < 1) continue;
          const textCenterY = tRect.top + tRect.height / 2;
          const offset = Math.abs(icon.centerY - textCenterY);
          if (offset > 2) {
            misaligned.push({
              iconSelector: icon.selector,
              textSelector: getSelector(child),
              offset: Math.round(offset),
            });
          }
          break;
        }
      }
    }

    return { inconsistentWithinContext, misaligned };
  }

  // ─── Analysis: Nested Scrolling ───────────────────────────

  function analyzeNestedScrolling(elements) {
    const scrollable = elements.filter((item) => {
      const s = item.styles;
      return (s.overflow === "auto" || s.overflow === "scroll" ||
              s.overflowX === "auto" || s.overflowX === "scroll" ||
              s.overflowY === "auto" || s.overflowY === "scroll");
    });

    const issues = [];
    for (const item of scrollable) {
      let ancestor = item.el.parentElement;
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
        const cs = getComputedStyle(ancestor);
        if (cs.overflow === "auto" || cs.overflow === "scroll" ||
            cs.overflowX === "auto" || cs.overflowX === "scroll" ||
            cs.overflowY === "auto" || cs.overflowY === "scroll") {
          issues.push({
            innerSelector: item.selector,
            outerSelector: getSelector(ancestor),
          });
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    return issues;
  }

  // ─── Analysis: Cramped Padding ──────────────────────────

  function analyzeCrampedPadding(elements) {
    const issues = [];
    for (const item of elements) {
      // Only check elements with visible boundaries (border or non-transparent bg)
      const s = item.styles;
      const hasBorder = s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
      const hasBg = !isTransparent(s.backgroundColor);
      if (!hasBorder && !hasBg) continue;

      // Must contain direct text (not just text in descendants)
      if (!hasDirectText(item.el)) continue;
      // Skip tiny elements, inline tags, and form controls
      if (item.rect.width < 60 || item.rect.height < 20) continue;
      if (["span", "a", "button", "input", "select", "textarea", "label", "th", "td", "li", "table", "nav"].includes(item.tag)) continue;
      // Skip flex/grid containers whose children are interactive elements with their own padding (toolbars, nav bars)
      if ((s.display === "flex" || s.display === "inline-flex" || s.display === "grid") && !hasDirectText(item.el)) {
        const children = Array.from(item.el.children);
        const allInteractive = children.length > 0 && children.every(c =>
          ["A", "BUTTON", "INPUT", "SELECT"].includes(c.tagName) || c.getAttribute("role") === "button"
        );
        if (allInteractive) continue;
      }

      // Skip flex-centered containers — content is visually centered regardless of padding
      if (s.display === "flex" || s.display === "inline-flex") {
        const cs = getComputedStyle(item.el);
        if (cs.alignItems === "center" && cs.justifyContent === "center") continue;
      }

      const pt = parseFloat(s.paddingTop) || 0;
      const pr = parseFloat(s.paddingRight) || 0;
      const pb = parseFloat(s.paddingBottom) || 0;
      const pl = parseFloat(s.paddingLeft) || 0;
      const fontSize = parseFloat(s.fontSize) || 14;

      // Padding should be at least ~50% of font size on all sides for comfortable reading
      const minPadding = Math.max(6, fontSize * 0.5);
      const cramped = [];
      if (pt < minPadding) cramped.push(`top:${Math.round(pt)}px`);
      if (pr < minPadding) cramped.push(`right:${Math.round(pr)}px`);
      if (pb < minPadding) cramped.push(`bottom:${Math.round(pb)}px`);
      if (pl < minPadding) cramped.push(`left:${Math.round(pl)}px`);

      if (cramped.length >= 2) {
        issues.push({
          selector: item.selector,
          padding: `${Math.round(pt)} ${Math.round(pr)} ${Math.round(pb)} ${Math.round(pl)}`,
          fontSize: Math.round(fontSize),
          crampedSides: cramped,
          minRecommended: Math.round(minPadding),
        });
      }
    }
    return issues;
  }

  // ─── Analysis: Form Labels ────────────────────────────────

  function analyzeFormLabels(elements) {
    const inputs = elements.filter((item) => {
      if (!["input", "select", "textarea"].includes(item.tag)) return false;
      const type = item.el.type;
      if (type === "hidden" || type === "submit" || type === "button") return false;
      return true;
    });

    const issues = [];
    for (const item of inputs) {
      const el = item.el;
      // Check label[for]
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) continue;
      // Check wrapping label
      if (el.closest("label")) continue;
      // Check aria attributes
      if (el.getAttribute("aria-label")) continue;
      if (el.getAttribute("aria-labelledby")) continue;
      if (el.getAttribute("title")) continue;
      // Placeholder serves as a visible label for simple forms
      if (el.getAttribute("placeholder")) continue;

      issues.push({
        selector: item.selector, tag: item.tag,
        type: el.type || item.tag,
      });
    }
    return issues;
  }

  // ─── Analysis: Nested Panels ─────────────────────────────

  function analyzeNestedPanels(elements) {
    const LAYOUT_TAGS = new Set(["header", "footer", "nav", "aside", "main", "section", "article"]);
    const LAYOUT_ROLES = new Set(["banner", "main", "contentinfo", "navigation", "complementary", "region"]);

    // Find elements that look like panels/cards: have visible background or border,
    // reasonable size, and are containers (not inline text)
    function isPanel(item) {
      const s = item.styles;
      const hasBg = !isTransparent(s.backgroundColor);
      const hasBorder = s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
      const hasShadow = s.boxShadow && s.boxShadow !== "none";
      if (!hasBg && !hasBorder && !hasShadow) return false;
      // Must be at least 50x50 to be a "panel"
      if (item.rect.width < 50 || item.rect.height < 50) return false;
      // Skip inline text elements
      if (["span", "a", "button", "input", "select", "textarea", "label"].includes(item.tag)) return false;
      // Skip table elements — thead/th/td with backgrounds are standard table styling, not panels
      if (["table", "thead", "tbody", "tfoot", "tr", "th", "td"].includes(item.tag)) return false;
      // Skip image/media placeholder elements — they have background color but no text content
      // These are common in product cards, hero sections, etc.
      if (hasBg && !hasBorder && !hasShadow && !hasDirectText(item.el) && item.el.children.length === 0) return false;
      return true;
    }

    function isLayoutElement(item) {
      if (LAYOUT_TAGS.has(item.tag)) return true;
      const role = item.el.getAttribute("role");
      if (role && LAYOUT_ROLES.has(role)) return true;
      return false;
    }

    function isAppShellWrapper(item) {
      // Full-width or near-full-viewport containers are layout wrappers, not visual panels
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return item.rect.width > vw * 0.9 && item.rect.height > vh * 0.8;
    }

    function isGridOrFlexContainer(item) {
      // Grid/flex containers that hold cards are layout wrappers, not visual panels
      const s = item.styles || getComputedStyle(item.el);
      const display = s.display;
      if (display === "grid" || display === "inline-grid" || display === "flex" || display === "inline-flex") return true;
      // Also check if the element has many direct children that look like cards (>= 3 same-tag children)
      const children = item.el.children;
      if (children.length >= 3) {
        const tags = {};
        for (const ch of children) { tags[ch.tagName] = (tags[ch.tagName] || 0) + 1; }
        if (Object.values(tags).some(count => count >= 3)) return true;
      }
      return false;
    }

    function isContentFrame(item) {
      // Containers that take most of their parent's width are content frames, not visual panels
      const parent = item.el.parentElement;
      if (!parent || parent === document.body) return false;
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.width === 0) return false;
      const widthRatio = item.rect.width / parentRect.width;
      return widthRatio > 0.95;
    }

    const panels = elements.filter(isPanel);
    const issues = [];

    for (const inner of panels) {
      // Skip layout elements (header, nav, aside, main inside a layout div is normal)
      if (isLayoutElement(inner)) continue;

      let ancestor = inner.el.parentElement;
      let depth = 0;
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement && depth < 10) {
        depth++;
        const ancestorPanel = panels.find((p) => p.el === ancestor);
        if (ancestorPanel) {
          // Skip if outer is an app shell wrapper (near-full viewport)
          if (isAppShellWrapper(ancestorPanel)) break;
          // Skip if outer is a layout element (standard app structure)
          if (isLayoutElement(ancestorPanel)) break;
          // Skip if outer is a grid/flex container holding cards (standard dashboard layout)
          if (isGridOrFlexContainer(ancestorPanel)) break;
          // Skip if outer is a content frame (takes most of parent width, just a wrapper)
          if (isContentFrame(ancestorPanel)) break;
          // Skip if inner is nearly the same size (just a wrapper)
          const areaRatio = (inner.rect.width * inner.rect.height) /
            (ancestorPanel.rect.width * ancestorPanel.rect.height);
          if (areaRatio < 0.85) {
            issues.push({
              innerSelector: inner.selector,
              outerSelector: ancestorPanel.selector,
              innerSize: `${inner.rect.width}x${inner.rect.height}`,
              outerSize: `${ancestorPanel.rect.width}x${ancestorPanel.rect.height}`,
            });
          }
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    return issues;
  }

  // ─── Analysis: Adjacent Panels ──────────────────────────────

  function analyzeAdjacentPanels(elements) {
    // Find bordered/shadowed panel-like siblings that are nearly touching
    const panels = elements.filter(item => {
      const s = item.styles;
      const hasBorder = s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
      const hasShadow = s.boxShadow && s.boxShadow !== "none";
      if (!hasBorder && !hasShadow) return false;
      if (item.rect.width < 80 || item.rect.height < 30) return false;
      if (["span", "a", "button", "input", "select", "textarea", "label"].includes(item.tag)) return false;
      return true;
    });

    // Group by parent
    const byParent = new Map();
    for (const p of panels) {
      const parent = p.el.parentElement;
      if (!parent) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(p);
    }

    const issues = [];
    for (const [parent, siblings] of byParent) {
      if (siblings.length < 2) continue;
      siblings.sort((a, b) => a.rect.top - b.rect.top);
      for (let i = 0; i < siblings.length - 1; i++) {
        const a = siblings[i], b = siblings[i + 1];
        const gap = b.rect.top - a.rect.bottom;
        if (gap >= 0 && gap < 4) {
          issues.push({
            selectorA: a.selector, selectorB: b.selector,
            gap: Math.round(gap),
          });
        }
      }
    }
    return issues;
  }

  // ─── Analysis: Rounded Border Sprawl ───────────────────────

  function analyzeRoundedBorderSprawl(elements) {
    // Collect distinct border-radius values on "panel-like" elements (>= 80px on any side)
    const panelRadii = {}; // radius value → count
    const MIN_PANEL_SIZE = 80;

    for (const item of elements) {
      const br = item.styles.borderRadius;
      if (!br || br === "0px") continue;
      // Only care about sizable containers
      if (item.rect.width < MIN_PANEL_SIZE || item.rect.height < MIN_PANEL_SIZE) continue;
      if (["span", "a", "button", "input", "select", "textarea", "label", "img"].includes(item.tag)) continue;

      // Parse the radius — normalize pill values
      let normalized = br;
      const parsed = parseFloat(br);
      if (parsed >= 100) normalized = "pill";

      if (!panelRadii[normalized]) panelRadii[normalized] = 0;
      panelRadii[normalized]++;
    }

    const distinctValues = Object.keys(panelRadii);
    const totalRounded = Object.values(panelRadii).reduce((a, b) => a + b, 0);

    return {
      distinctRadii: distinctValues,
      radiusCounts: panelRadii,
      totalRoundedPanels: totalRounded,
      tooManyVariants: distinctValues.length > 4,
      overuse: totalRounded > 20,
    };
  }

  // ─── Color Palette Analysis (OKLCH color wheel) ─────────────

  // Inline OKLCH conversion from palette library
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  function linearToSrgb(c) {
    c = Math.max(0, Math.min(1, c));
    return (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
  }
  function rgbToOklch(r, g, b) {
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    const C = Math.sqrt(A * A + B * B);
    let H = Math.atan2(B, A) * 180 / Math.PI;
    if (H < 0) H += 360;
    return [L, C, H];
  }
  function oklchToRgb(L, C, H) {
    const hRad = H * Math.PI / 180;
    const A = C * Math.cos(hRad), B_ = C * Math.sin(hRad);
    const l_ = L + 0.3963377774 * A + 0.2158037573 * B_;
    const m_ = L - 0.1055613458 * A - 0.0638541728 * B_;
    const s_ = L - 0.0894841775 * A - 1.2914855480 * B_;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return [Math.round(linearToSrgb(lr)), Math.round(linearToSrgb(lg)), Math.round(linearToSrgb(lb))];
  }
  function rgbToHex(r, g, b) {
    const cl = v => Math.max(0, Math.min(255, Math.round(v)));
    return "#" + [r, g, b].map(v => cl(v).toString(16).padStart(2, "0")).join("");
  }
  function normHue(h) { return ((h % 360) + 360) % 360; }
  function hueDist(a, b) { const d = Math.abs(normHue(a) - normHue(b)); return Math.min(d, 360 - d); }

  // Color wheel strategy templates (from palette library)
  function strategyHues(anchor, count, strategy) {
    const norm = h => ((h % 360) + 360) % 360;
    const fromKey = (anch, n, keys) => {
      const h = keys.slice(0, n).map(a => norm(anch + a));
      const step = 360 / n;
      for (let i = h.length; i < n; i++) h.push(norm(anch + i * step));
      return h;
    };
    switch (strategy) {
      case "complementary": return fromKey(anchor, count, [0, 180]);
      case "split-complementary": return fromKey(anchor, count, [0, 150, 210]);
      case "triadic": return fromKey(anchor, count, [0, 120, 240]);
      case "tetradic": return fromKey(anchor, count, [0, 90, 180, 270]);
      case "analogous": {
        const h = [anchor];
        for (let i = 1; h.length < count; i++) {
          h.push(norm(anchor + i * 30));
          if (h.length < count) h.push(norm(anchor - i * 30));
        }
        return h;
      }
      default: // evenly-spaced
        return Array.from({ length: count }, (_, i) => norm(anchor + i * (360 / count)));
    }
  }

  const STRATEGY_NAMES = ["evenly-spaced", "analogous", "complementary", "split-complementary", "triadic", "tetradic"];

  // Shade generation (from palette library — Tailwind-scale using OKLCH)
  const SHADE_LEVELS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const LIGHTER_T = { 50: 0.92, 100: 0.80, 200: 0.62, 300: 0.42, 400: 0.18 };
  const DARKER_T  = { 600: 0.18, 700: 0.38, 800: 0.56, 900: 0.76, 950: 0.92 };
  const LIGHT_END = 0.98, DARK_END = 0.10;

  function generateShades(baseL, baseC, baseH) {
    return SHADE_LEVELS.map(shade => {
      if (shade === 500) return { shade, L: baseL, C: baseC, H: baseH };
      let L, cScale;
      if (shade < 500) {
        const t = LIGHTER_T[shade];
        L = baseL + (LIGHT_END - baseL) * t;
        cScale = 1 - t * 0.95;
      } else {
        const t = DARKER_T[shade];
        L = baseL - (baseL - DARK_END) * t;
        cScale = 1 - t * 0.65;
      }
      return { shade, L, C: baseC * Math.max(0, cScale), H: baseH };
    });
  }

  function shadeToHex(s) { return rgbToHex(...oklchToRgb(s.L, s.C, s.H)); }

  // Find the shade that would give sufficient contrast against a background
  function findContrastingShade(shades, bgRgb, requiredRatio) {
    const bgLum = relativeLuminance(bgRgb);
    // Find the shade closest to mid-range that just barely meets the contrast requirement
    // This gives the most natural suggestion (not jumping to near-black/white)
    const isLightBg = bgLum > 0.18;

    // Sort by shade level: for light bg, try from mid-dark outward (600→700→800→900→950)
    // For dark bg, try from mid-light outward (400→300→200→100→50)
    const passing = [];
    for (const s of shades) {
      const rgb = oklchToRgb(s.L, s.C, s.H);
      const fgLum = relativeLuminance({ r: rgb[0], g: rgb[1], b: rgb[2] });
      const ratio = contrastRatio(fgLum, bgLum);
      if (ratio >= requiredRatio) {
        passing.push({ shade: s.shade, hex: rgbToHex(...rgb), ratio: Math.round(ratio * 100) / 100 });
      }
    }

    if (passing.length === 0) return null;

    // Pick the shade closest to 500 (the base) among those that pass
    // This ensures we suggest the most "colorful" viable shade rather than near-black/white
    passing.sort((a, b) => Math.abs(a.shade - 500) - Math.abs(b.shade - 500));
    return passing[0];
  }

  function analyzePalette() {
    // 1. Collect CSS custom properties that look like color tokens
    const COLOR_VAR_PATTERN = /primary|secondary|accent|tertiary|neutral|brand|surface|background|foreground|muted|destructive|success|warning|info|danger|error|[-_]bg[-_]|[-_]bg$|^--bg[-_]|^--bg$/i;
    const cssVars = {};

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.style) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style.getPropertyValue(rule.style[i]);
              const name = rule.style[i];
              if (name.startsWith("--") && COLOR_VAR_PATTERN.test(name)) {
                const val = prop.trim();
                if (val && !val.startsWith("var(")) cssVars[name] = val;
              }
            }
          }
        }
      } catch (_) { /* cross-origin stylesheet */ }
    }

    // Also check :root computed style
    const rootStyle = getComputedStyle(document.documentElement);
    const rootProps = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText === ":root" || rule.selectorText === "html") {
            for (let i = 0; i < rule.style.length; i++) {
              const name = rule.style[i];
              if (name.startsWith("--")) rootProps.push(name);
            }
          }
        }
      } catch (_) {}
    }
    for (const name of rootProps) {
      if (COLOR_VAR_PATTERN.test(name) && !cssVars[name]) {
        const val = rootStyle.getPropertyValue(name).trim();
        if (val) cssVars[name] = val;
      }
    }

    // 2. Parse collected color values to RGB
    function parseColorToRgb(val) {
      // hex
      if (val.startsWith("#")) {
        let hex = val.slice(1);
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length === 6) {
          return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        }
      }
      // rgb()/rgba()
      const rgbMatch = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbMatch) return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];
      // hsl()/hsla() — use browser to resolve
      const hslMatch = val.match(/hsla?\(/);
      if (hslMatch) {
        const tmp = document.createElement("div");
        tmp.style.color = val;
        document.body.appendChild(tmp);
        const computed = getComputedStyle(tmp).color;
        document.body.removeChild(tmp);
        const m = computed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) return [+m[1], +m[2], +m[3]];
      }
      // oklch() — use browser
      if (val.includes("oklch")) {
        const tmp = document.createElement("div");
        tmp.style.color = val;
        document.body.appendChild(tmp);
        const computed = getComputedStyle(tmp).color;
        document.body.removeChild(tmp);
        const m = computed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) return [+m[1], +m[2], +m[3]];
      }
      // Space-separated values (Tailwind/shadcn format: "220 14% 96%") — treat as HSL
      const spaceMatch = val.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%?\s+(\d+(?:\.\d+)?)%?$/);
      if (spaceMatch) {
        const tmp = document.createElement("div");
        tmp.style.color = `hsl(${spaceMatch[1]}, ${spaceMatch[2]}%, ${spaceMatch[3]}%)`;
        document.body.appendChild(tmp);
        const computed = getComputedStyle(tmp).color;
        document.body.removeChild(tmp);
        const m = computed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) return [+m[1], +m[2], +m[3]];
      }
      return null;
    }

    // Build token list with parsed colors
    const tokens = [];
    for (const [name, val] of Object.entries(cssVars)) {
      const rgb = parseColorToRgb(val);
      if (!rgb) continue;
      const [L, C, H] = rgbToOklch(...rgb);
      tokens.push({ name, value: val, rgb, oklch: { L, C, H } });
    }

    // 3. Also collect prominent hardcoded colors from elements (background-color, color, border-color)
    // that are not from CSS variables
    const hardcodedHues = new Map(); // hue bucket → {rgb, count, oklch}
    const seenColors = new Set();
    const bodyEls = document.body.querySelectorAll("*");
    for (const el of bodyEls) {
      if (el.closest("[data-uxly-highlight]")) continue;
      const s = getComputedStyle(el);
      for (const prop of ["backgroundColor", "color", "borderTopColor"]) {
        const val = s[prop];
        if (!val || val === "rgba(0, 0, 0, 0)") continue;
        const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) continue;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        const key = `${r},${g},${b}`;
        if (seenColors.has(key)) { // already counted
          const bucket = Math.round(rgbToOklch(r, g, b)[2] / 10) * 10;
          if (hardcodedHues.has(bucket)) hardcodedHues.get(bucket).count++;
          continue;
        }
        seenColors.add(key);
        const [L, C, H] = rgbToOklch(r, g, b);
        // Skip near-achromatic colors (grays, blacks, whites)
        if (C < 0.03) continue;
        // Skip very light (near-white) and very dark (near-black)
        if (L > 0.95 || L < 0.1) continue;

        const bucket = Math.round(H / 10) * 10;
        if (!hardcodedHues.has(bucket)) {
          hardcodedHues.set(bucket, { rgb: [r, g, b], oklch: { L, C, H }, count: 1 });
        } else {
          hardcodedHues.get(bucket).count++;
        }
      }
    }

    // 4. Determine the main palette hues
    // From tokens: group by semantic role
    const tokensByRole = {};
    for (const t of tokens) {
      // Skip achromatic tokens
      if (t.oklch.C < 0.03) continue;
      // Extract role from name: --color-primary-500 → "primary"
      const roleMatch = t.name.match(/(primary|secondary|tertiary|accent|brand|neutral|destructive|success|warning|info|danger|error)/i);
      const role = roleMatch ? roleMatch[1].toLowerCase() : "other";
      if (!tokensByRole[role]) tokensByRole[role] = [];
      tokensByRole[role].push(t);
    }

    // Find the "base" hue for each role (the shade-500 or the most common hue)
    const roleHues = [];
    for (const [role, toks] of Object.entries(tokensByRole)) {
      if (role === "other" || role === "neutral") continue;
      // Prefer -500 shade or base variant
      const base = toks.find(t => t.name.match(/[-_](500|base|DEFAULT)$/i)) || toks[0];
      roleHues.push({ role, hue: base.oklch.H, L: base.oklch.L, C: base.oklch.C, name: base.name, hex: rgbToHex(...base.rgb) });
    }

    // If no tokens found, use the top hardcoded hue clusters
    let paletteSource = "css-variables";
    let mainHues = roleHues.map(r => r.hue);

    if (mainHues.length < 2) {
      paletteSource = "hardcoded-colors";
      // Sort hue buckets by count, take top N
      const sorted = [...hardcodedHues.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .filter(([, v]) => v.count >= 2);
      // Merge adjacent buckets (within 20°)
      const merged = [];
      for (const [bucket, data] of sorted) {
        const existing = merged.find(m => hueDist(m.hue, bucket) < 20);
        if (existing) {
          existing.count += data.count;
        } else {
          merged.push({ hue: bucket, count: data.count, oklch: data.oklch, rgb: data.rgb });
        }
      }
      merged.sort((a, b) => b.count - a.count);
      const topN = merged.slice(0, Math.min(6, merged.length));
      mainHues = topN.map(m => m.hue);
      // Build roleHues from hardcoded clusters
      const names = ["primary", "secondary", "tertiary", "accent", "neutral"];
      roleHues.length = 0;
      topN.forEach((m, i) => {
        roleHues.push({
          role: names[i] || `accent-${i - 3}`,
          hue: m.hue, L: m.oklch.L, C: m.oklch.C,
          hex: rgbToHex(...m.rgb), count: m.count,
        });
      });
    }

    if (mainHues.length < 2) {
      return { tokens, roleHues, paletteSource, strategy: null, score: null, suggestions: [], mainColorCount: mainHues.length, shadeScales: {} };
    }

    // 5. Find the best-matching color wheel strategy
    let bestStrategy = null;
    let bestCost = Infinity;
    let bestTemplate = null;

    for (const strat of STRATEGY_NAMES) {
      // Try every possible anchor (1° resolution)
      for (let anchor = 0; anchor < 360; anchor++) {
        const template = strategyHues(anchor, mainHues.length, strat);
        // Hungarian-style greedy matching: assign each input hue to nearest template slot
        const used = new Set();
        let cost = 0;
        const assignments = [];

        for (const inputH of mainHues) {
          let bestSlot = -1, bestDist = Infinity;
          for (let j = 0; j < template.length; j++) {
            if (used.has(j)) continue;
            const d = hueDist(inputH, template[j]);
            if (d < bestDist) { bestDist = d; bestSlot = j; }
          }
          used.add(bestSlot);
          cost += bestDist;
          assignments.push({ input: inputH, target: template[bestSlot], offset: bestDist });
        }

        if (cost < bestCost) {
          bestCost = cost;
          bestStrategy = strat;
          bestTemplate = assignments;
        }
      }
    }

    // 6. Compute alignment score and suggestions
    // Exclude semantic roles from harmony scoring — their hues are dictated by convention
    const SEMANTIC_SCORE_ROLES = new Set(["error", "danger", "destructive", "success", "warning", "info"]);
    let nonSemanticCost = 0, nonSemanticCount = 0;
    if (bestTemplate) {
      for (let i = 0; i < bestTemplate.length; i++) {
        if (!SEMANTIC_SCORE_ROLES.has(roleHues[i]?.role)) {
          nonSemanticCost += bestTemplate[i].offset;
          nonSemanticCount++;
        }
      }
    }
    const avgOffset = nonSemanticCount > 0 ? nonSemanticCost / nonSemanticCount : bestCost / mainHues.length;
    // Score: 100 = perfect alignment, 0 = 45°+ average offset
    const alignmentScore = Math.max(0, Math.round(100 - (avgOffset / 45) * 100));

    // Semantic roles whose hue is chosen for meaning (red=error, green=success, etc.)
    // These should not be adjusted to fit a color wheel strategy.
    const SEMANTIC_HUE_ROLES = new Set(["error", "danger", "destructive", "success", "warning", "info"]);

    const suggestions = [];
    if (bestTemplate) {
      for (let i = 0; i < bestTemplate.length; i++) {
        const a = bestTemplate[i];
        if (a.offset > 8) {
          const role = roleHues[i];
          // Skip semantic colors — their hues are chosen for meaning, not aesthetics
          if (SEMANTIC_HUE_ROLES.has(role.role)) continue;
          // Compute the suggested color at the target hue
          const suggestedRgb = oklchToRgb(role.L, role.C, a.target);
          const suggestedHex = rgbToHex(...suggestedRgb);
          suggestions.push({
            role: role.role,
            currentHue: Math.round(a.input),
            targetHue: Math.round(a.target),
            offset: Math.round(a.offset),
            currentHex: role.hex,
            suggestedHex,
            name: role.name || null,
          });
        }
      }
    }

    // 7. Generate shade scales for each palette color
    const shadeScales = {};
    for (const rh of roleHues) {
      const shades = generateShades(rh.L, rh.C, rh.hue);
      shadeScales[rh.role] = shades.map(s => ({
        shade: s.shade,
        hex: shadeToHex(s),
        L: s.L, C: s.C, H: s.H,
      }));
    }

    // 8. Analyze surface/background color layers
    const surfaceLayers = analyzeSurfaceLayers(cssVars, parseColorToRgb);

    return {
      tokens,
      roleHues,
      paletteSource,
      mainColorCount: mainHues.length,
      bestStrategy,
      alignmentScore,
      avgOffset: Math.round(avgOffset),
      suggestions,
      shadeScales,
      surfaceLayers,
    };
  }

  // ─── Surface / Background Layer Analysis ──────────────────

  function analyzeSurfaceLayers(cssVars, parseColorToRgb) {
    // Patterns for background/surface CSS variables
    const BG_PATTERNS = [
      // Direct background names
      /^--(?:color-)?(?:bg|background)(?:[-_](.+))?$/i,
      // Surface names (Material/shadcn style)
      /^--(?:color-)?surface(?:[-_](.+))?$/i,
      // Paper (MUI style)
      /^--(?:color-)?paper(?:[-_](.+))?$/i,
      // Canvas
      /^--(?:color-)?canvas(?:[-_](.+))?$/i,
      // Muted backgrounds
      /^--(?:color-)?muted(?:[-_](.+))?$/i,
      // Card/popover backgrounds (shadcn)
      /^--(?:color-)?(?:card|popover|dialog|modal|overlay|dropdown)(?:[-_]?(?:bg|background))?$/i,
      // Base backgrounds
      /^--(?:color-)?base(?:[-_](.+))?$/i,
      // Elevated surfaces
      /^--(?:color-)?elevated(?:[-_](.+))?$/i,
      // Generic layering: --layer-0, --layer-1, etc.
      /^--(?:color-)?layer(?:[-_](.+))?$/i,
    ];

    // Collect all bg/surface tokens into a single unified group
    const allLayers = [];

    for (const [name, val] of Object.entries(cssVars)) {
      let matched = false;

      for (const pattern of BG_PATTERNS) {
        const m = name.match(pattern);
        if (m) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      const rgb = parseColorToRgb(val);
      if (!rgb) continue;
      const [L, C, H] = rgbToOklch(...rgb);

      allLayers.push({
        name, rgb, oklch: { L, C, H },
        hex: rgbToHex(...rgb),
      });
    }

    // Also scan for hardcoded bg patterns on elements if no CSS vars found
    if (allLayers.length === 0) {
      const bgElements = document.querySelectorAll("[class*='bg-'], [class*='surface'], [class*='background']");
      const bgColors = new Map();
      for (const el of bgElements) {
        const s = getComputedStyle(el);
        const bg = s.backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)") continue;
        const m = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) continue;
        const hex = rgbToHex(+m[1], +m[2], +m[3]);
        bgColors.set(hex, (bgColors.get(hex) || 0) + 1);
      }
      if (bgColors.size >= 2) {
        let idx = 0;
        for (const [hex] of [...bgColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
          const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
          const [L, C, H] = rgbToOklch(...rgb);
          allLayers.push({
            name: `bg-${idx}`, rgb, oklch: { L, C, H }, hex,
          });
          idx++;
        }
      }
    }

    // Need at least 2 layers to analyze
    if (allLayers.length < 2) return [];

    // Sort all layers by actual lightness (brightest first → darkest last)
    allLayers.sort((a, b) => b.oklch.L - a.oklch.L);

    // Compute lightness steps between consecutive layers
    const lightnessValues = allLayers.map(l => l.oklch.L);
    const lightnessSteps = [];
    for (let i = 0; i < lightnessValues.length - 1; i++) {
      lightnessSteps.push(Math.abs(lightnessValues[i] - lightnessValues[i + 1]));
    }

    // Check step consistency (are the jumps between layers roughly even?)
    let stepConsistency = 1;
    if (lightnessSteps.length >= 2) {
      const avgStep = lightnessSteps.reduce((a, b) => a + b, 0) / lightnessSteps.length;
      if (avgStep > 0.005) {
        const maxDev = Math.max(...lightnessSteps.map(s => Math.abs(s - avgStep)));
        stepConsistency = Math.max(0, 1 - (maxDev / avgStep));
      }
    }

    // Check hue consistency (surface layers should stay on the same hue)
    const chromaValues = allLayers.map(l => l.oklch.C);
    const hasChroma = chromaValues.some(c => c > 0.005);
    let hueConsistent = true;
    if (hasChroma) {
      const hues = allLayers.filter(l => l.oklch.C > 0.005).map(l => l.oklch.H);
      if (hues.length >= 2) {
        const maxHueDist = Math.max(...hues.map((h, i) =>
          i === 0 ? 0 : hueDist(h, hues[0])
        ));
        hueConsistent = maxHueDist < 30;
      }
    }

    // Generate suggested even steps if consistency is poor
    const suggestedLayers = [];
    if (allLayers.length >= 2 && stepConsistency < 0.5) {
      const startL = Math.max(...lightnessValues);
      const endL = Math.min(...lightnessValues);
      const baseH = allLayers[0].oklch.H;
      const baseC = allLayers[0].oklch.C;
      const step = (startL - endL) / (allLayers.length - 1);
      for (let i = 0; i < allLayers.length; i++) {
        const L = startL - i * step;
        suggestedLayers.push({
          shade: allLayers[i].name,
          hex: rgbToHex(...oklchToRgb(L, baseC, baseH)),
          L: Math.round(L * 1000) / 1000,
        });
      }
    }

    return [{
      group: "surfaces",
      layers: allLayers.map(l => ({ name: l.name, hex: l.hex, L: Math.round(l.oklch.L * 1000) / 1000, C: Math.round(l.oklch.C * 1000) / 1000 })),
      lightnessSteps: lightnessSteps.map(s => Math.round(s * 1000) / 1000),
      stepConsistency: Math.round(stepConsistency * 100),
      hueConsistent,
      suggestedLayers,
    }];
  }

  // ─── Findings Engine ──────────────────────────────────────

  function generateFindings(consistency, elements, analyses, elementToComponent) {
    const findings = [];
    // Map selector labels to uxlyIds for post-processing
    const selectorToUxlyId = {};
    for (const item of elements) {
      const eid = getUxlyId(item.el);
      if (eid) selectorToUxlyId[item.selector] = eid;
    }

    const EXPECTED_VARIANTS = {
      "filled-button": { fontSize: 3, fontWeight: 2, borderRadius: 2, backgroundColor: 3, color: 3, paddingTop: 3, paddingBottom: 3, paddingLeft: 3, paddingRight: 3 },
      "ghost-button": { fontSize: 3, fontWeight: 2, borderRadius: 2, color: 3, paddingTop: 3, paddingBottom: 3, paddingLeft: 3, paddingRight: 3 },
      "icon-button": { fontSize: 3, fontWeight: 2, borderRadius: 2, paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 },
      input: { fontSize: 2, fontWeight: 1, borderRadius: 1, backgroundColor: 2, paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 },
      "nav-link": { fontSize: 2, fontWeight: 2, color: 2, paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 },
      "footer-link": { fontSize: 2, fontWeight: 2, color: 2, paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 },
      "header-link": { fontSize: 2, fontWeight: 2, color: 2, paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 },
      "body-link": { fontSize: 2, fontWeight: 2, color: 3, paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 },
      text: { fontFamily: 2, fontSize: 8, fontWeight: 4 },
    };

    const ROLE_LABELS = {
      "filled-button": "Filled buttons", "ghost-button": "Ghost buttons", "icon-button": "Icon buttons",
      "nav-link": "Nav links", "footer-link": "Footer links", "header-link": "Header links", "body-link": "Links",
      input: "Inputs", select: "Dropdowns",
      text: "Text elements", h1: "H1 headings", h2: "H2 headings", h3: "H3 headings",
      h4: "H4 headings", h5: "H5 headings", h6: "H6 headings", table: "Tables",
    };

    function getRoleLabel(role) {
      if (ROLE_LABELS[role]) return ROLE_LABELS[role];
      // Handle context-prefixed headings like "sidebar-h3", "nav-h2"
      const m = role.match(/^(\w+)-(h[1-6])$/);
      if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2].toUpperCase()} headings`;
      return role;
    }

    // ── Existing consistency findings ──
    for (const [role, group] of Object.entries(consistency)) {
      const label = getRoleLabel(role);
      const expected = EXPECTED_VARIANTS[role] || {};

      for (const [prop, data] of Object.entries(group.properties)) {
        if (data.isConsistent) continue;

        const variants = data.variants;
        const nonTransparent = variants.filter((v) => !isTransparent(v.value));
        const isColorProp = prop.toLowerCase().includes("color") || prop === "backgroundColor";

        if (isColorProp && nonTransparent.length >= 2) {
          const parsed = nonTransparent.map((v) => ({ ...v, rgb: parseColor(v.value) })).filter((v) => v.rgb);
          for (let i = 0; i < parsed.length; i++) {
            for (let j = i + 1; j < parsed.length; j++) {
              const dist = colorDistance(parsed[i].rgb, parsed[j].rgb);
              if (dist > 0 && dist < 15) {
                findings.push({ severity: "error", category: "near-miss-color",
                  message: `${label}: Near-identical ${prop} values that should be the same design token. "${parsed[i].value}" (${parsed[i].count}x) and "${parsed[j].value}" (${parsed[j].count}x) differ by only ~${Math.round(dist)} units. Unify them.` });
              } else if (dist >= 15 && dist < 35) {
                findings.push({ severity: "warn", category: "similar-color",
                  message: `${label}: Suspiciously similar ${prop} values. "${parsed[i].value}" (${parsed[i].count}x) and "${parsed[j].value}" (${parsed[j].count}x) are close (delta ~${Math.round(dist)}). Verify these are intentionally different tokens.` });
              }
            }
          }
          if (nonTransparent.length > 4 && (role.includes("button") || role === "input")) {
            findings.push({ severity: "warn", category: "too-many-colors",
              message: `${label}: ${nonTransparent.length} distinct ${prop} values across ${group.elementCount} elements. A design system typically uses 2-3 variants. Consider consolidating.` });
          }
        }

        if (prop === "fontSize") {
          const maxExpected = expected.fontSize || 3;
          if (variants.length > maxExpected) {
            findings.push({ severity: variants.length > maxExpected + 2 ? "error" : "warn", category: "too-many-sizes",
              message: `${label}: ${variants.length} different font sizes (${variants.map((v) => v.value).join(", ")}). Expected at most ${maxExpected}. Reduce to a consistent scale.` });
          }
        }

        if (prop === "fontWeight") {
          const maxExpected = expected.fontWeight || 2;
          if (variants.length > maxExpected) {
            findings.push({ severity: "warn", category: "too-many-weights",
              message: `${label}: ${variants.length} different font weights (${variants.map((v) => `${v.value} (${v.count}x)`).join(", ")}). Typically use ${maxExpected} weights.` });
          }
        }

        if (prop === "borderRadius") {
          const meaningful = variants.filter((v) => v.value !== "0px");
          if (meaningful.length > 2) {
            findings.push({ severity: "warn", category: "inconsistent-rounding",
              message: `${label}: ${meaningful.length} distinct border-radius values (${meaningful.map((v) => v.value).join(", ")}). Pick a consistent rounding scale.` });
          }
        }

        if (prop.startsWith("padding")) {
          const nonZero = variants.filter((v) => v.value !== "0px");
          if (nonZero.length > 3 && (role.includes("button") || role === "input" || role.includes("link"))) {
            findings.push({ severity: "warn", category: "inconsistent-padding",
              message: `${label}: ${nonZero.length} different ${prop} values (${nonZero.map((v) => v.value).join(", ")}). Padding should follow a spacing scale.` });
          }
        }

        // Outlier detection is done after the property loop (see below)

        if (/(?:^|-)h[1-6]$/.test(role) && group.elementCount >= 2) {
          if ((prop === "fontSize" || prop === "color" || prop === "fontWeight") && variants.length > 1) {
            findings.push({ severity: "error", category: "heading-inconsistency",
              message: `${label}: Same heading level but different ${prop} (${variants.map((v) => `${v.value} x${v.count}`).join(", ")}). All ${role.toUpperCase()} should look identical.` });
          }
        }
      }

      // ── Outlier detection: find single-element outliers, but skip active/selected states ──
      // First, identify which elements are outliers on which properties
      const outlierProps = []; // { prop, dominant, outlierValue }
      for (const [prop, data] of Object.entries(group.properties)) {
        if (data.isConsistent) continue;
        const variants = data.variants;
        if (variants.length < 2 || variants[0].count < 3) continue;
        const outlierTotal = variants.slice(1).reduce((sum, v) => sum + v.count, 0);
        if (outlierTotal !== 1 || group.elementCount < 4) continue;
        const isColorProp = prop.toLowerCase().includes("color") || prop === "backgroundColor";
        if (isColorProp && isTransparent(variants[1].value)) continue;
        outlierProps.push({ prop, dominant: variants[0].value, outlierValue: variants[1].value });
      }

      // If the same element is the outlier on 2+ properties, it's likely an intentional
      // variant (active state, badge, tag, avatar, etc.) — not a bug
      if (outlierProps.length >= 2) {
        const hasVisualOutlier = outlierProps.some((o) =>
          o.prop.toLowerCase().includes("color") || o.prop === "backgroundColor" || o.prop === "borderRadius"
        );
        if (hasVisualOutlier) {
          // Skip — likely active/selected state, badge, or intentional accent element
        } else {
          findings.push({ severity: "info", category: "outlier",
            message: `${label}: 1 element differs from the other ${group.elementCount - 1} on ${outlierProps.length} properties (${outlierProps.map((o) => o.prop).join(", ")}). May be an intentional variant.` });
        }
      } else if (outlierProps.length === 1) {
        const o = outlierProps[0];
        const isTextGroup = role === "text";
        const isVisualProp = o.prop === "backgroundColor" || o.prop === "borderRadius" || o.prop === "boxShadow";
        const isColorProp = o.prop === "color" || o.prop === "backgroundColor";
        const isInteractiveRole = role.includes("button") || role.includes("link") || role === "tab";
        if (isTextGroup && isVisualProp) {
          // Skip — single text element with different bg/radius is a badge or accent
        } else if (isInteractiveRole && isColorProp) {
          // Skip — single button/link/tab with different color is likely active/selected state
        } else {
          findings.push({ severity: "warn", category: "outlier",
            message: `${label}: ${group.elementCount - 1}/${group.elementCount} elements use ${o.prop}: ${o.dominant}, but 1 uses ${o.outlierValue}. Likely a bug — should match the others.` });
        }
      }

      const ffProp = group.properties.fontFamily;
      if (ffProp && !ffProp.isConsistent) {
        // Values are already case-normalized by normalizeValue, filter icon fonts and monospace
        const MONO_KEYWORDS = /\b(mono|monospace|sf mono|cascadia|fira code|jetbrains|consolas|menlo|courier)\b/i;
        const realFonts = ffProp.variants.filter((v) =>
          !v.value.match(/\b(icon|lucide|fontawesome|material|symbol|glyph)\b/i) &&
          !v.value.match(MONO_KEYWORDS)
        );
        // Also dedupe by primary font name (first in the list)
        const primaryFonts = new Set(realFonts.map((v) => v.value.split(",")[0].trim()));
        if (primaryFonts.size > 1) {
          findings.push({ severity: "warn", category: "mixed-fonts",
            message: `${label}: ${primaryFonts.size} different font families (${[...primaryFonts].join(", ")}). Mixing fonts within the same role is inconsistent.` });
        }
      }
    }

    // ── Spacing ──
    const spacing = analyses.spacing;
    if (spacing.length > 5) {
      findings.push({ severity: "warn", category: "cramped-text",
        message: `${spacing.length} pairs of text blocks are too close together relative to font size. Add more vertical margin.` });
    }
    for (const issue of spacing.slice(0, 3)) {
      findings.push({ severity: "info", category: "cramped-text-detail",
        message: `"${issue.elementA.selector}" (${issue.elementA.fontSize}) and "${issue.elementB.selector}" (${issue.elementB.fontSize}) are only ${issue.gap}px apart. Need at least ${Math.round(issue.avgFontSize * 0.5)}px.` });
    }

    // ── Color palette (dedupe near-identical colors) ──
    const colorList = [];
    for (const item of elements) {
      for (const cStr of [item.styles.color, item.styles.backgroundColor]) {
        if (!cStr || isTransparent(cStr)) continue;
        const rgb = parseColor(cStr);
        if (!rgb) continue;
        // Check if this color is near-identical to one already collected
        const isDupe = colorList.some((existing) => colorDistance(existing, rgb) < 10);
        if (!isDupe) colorList.push(rgb);
      }
    }
    // Raise threshold if charts are present — charts legitimately use many data-series colors
    const hasCharts = analyses.charts && analyses.charts.length > 0;
    const sprawlThreshold = hasCharts ? 30 : 20;
    if (colorList.length > sprawlThreshold) {
      findings.push({ severity: "warn", category: "color-sprawl",
        message: `Page uses ~${colorList.length} perceptually distinct colors. A well-constrained system uses ${hasCharts ? "15-25 (with charts)" : "8-15"}. Colors may be set ad-hoc instead of from a token palette.` });
    }

    // ── WCAG Contrast ──
    const contrast = analyses.contrast;
    const palette = analyses.palette;
    if (contrast.length > 0) {
      const count = contrast.length;
      const shown = contrast.slice(0, 5);
      for (const c of shown) {
        let suggestion = "";
        // Try to suggest a palette shade that would fix the contrast
        if (palette.mainColorCount >= 2) {
          const fgM = c.fgColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
          const bgM = c.bgColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
          if (fgM && bgM) {
            const fgRgb = { r: +fgM[1], g: +fgM[2], b: +fgM[3] };
            const bgRgb = { r: +bgM[1], g: +bgM[2], b: +bgM[3] };
            const fgOklch = rgbToOklch(fgRgb.r, fgRgb.g, fgRgb.b);
            const bgOklch = rgbToOklch(bgRgb.r, bgRgb.g, bgRgb.b);
            const fgIsNeutral = fgOklch[1] < 0.03; // near-achromatic (white/gray/black)
            const bgIsNeutral = bgOklch[1] < 0.03;

            // Determine: should we fix fg or bg?
            // If fg is white/black on a colored bg → suggest a darker/lighter bg shade
            // If fg is colored on neutral bg → suggest a different fg shade
            // If both colored → suggest fixing whichever is closer to a palette color
            let fixTarget = "fg"; // "fg" = suggest new foreground, "bg" = suggest new background
            let matchRole = null, matchDist = Infinity;

            if (fgIsNeutral && !bgIsNeutral) {
              // White/black text on colored background → darken/lighten the bg
              fixTarget = "bg";
              for (const rh of palette.roleHues) {
                const d = hueDist(bgOklch[2], rh.hue);
                if (d < matchDist) { matchDist = d; matchRole = rh.role; }
              }
            } else if (!fgIsNeutral && bgIsNeutral) {
              // Colored text on neutral background → adjust the fg
              fixTarget = "fg";
              for (const rh of palette.roleHues) {
                const d = hueDist(fgOklch[2], rh.hue);
                if (d < matchDist) { matchDist = d; matchRole = rh.role; }
              }
            } else {
              // Both colored or both neutral — match the more chromatic one
              for (const rh of palette.roleHues) {
                const dFg = hueDist(fgOklch[2], rh.hue);
                const dBg = hueDist(bgOklch[2], rh.hue);
                if (dFg < matchDist) { matchDist = dFg; matchRole = rh.role; fixTarget = "fg"; }
                if (dBg < matchDist) { matchDist = dBg; matchRole = rh.role; fixTarget = "bg"; }
              }
            }

            if (matchRole && matchDist < 40 && palette.shadeScales[matchRole]) {
              const shades = palette.shadeScales[matchRole].map(s => ({
                shade: s.shade, L: s.L, C: s.C, H: s.H,
              }));
              if (fixTarget === "bg") {
                // Find a bg shade that gives enough contrast with white/black fg
                const fix = findContrastingShade(shades, fgRgb, c.required);
                if (fix) {
                  suggestion = ` Try ${matchRole}-${fix.shade} (${fix.hex}) as background (${fix.ratio}:1 contrast).`;
                }
              } else {
                const fix = findContrastingShade(shades, bgRgb, c.required);
                if (fix) {
                  suggestion = ` Try ${matchRole}-${fix.shade} (${fix.hex}) as text color (${fix.ratio}:1 contrast).`;
                }
              }
            }
          }
        }
        findings.push({ severity: "error", category: "low-contrast",
          message: `"${c.selector}" has contrast ratio ${c.ratio}:1 (requires ${c.required}:1 for ${c.isLarge ? "large" : "normal"} text). Foreground: ${c.fgColor}, background: ${c.bgColor}.${suggestion || " Increase the contrast to meet WCAG AA."}` });
      }
      if (count > 5) {
        findings.push({ severity: "error", category: "low-contrast",
          message: `${count - 5} more elements fail WCAG AA contrast requirements. Review all text elements for sufficient color contrast.` });
      }
    }

    // ── Tap Targets ──
    const taps = analyses.tapTargets;
    if (taps.tooSmall.length > 0) {
      const shown = taps.tooSmall.slice(0, 3);
      for (const t of shown) {
        findings.push({ severity: "warn", category: "tiny-tap-target",
          message: `"${t.selector}" is ${t.width}x${t.height}px. Interactive elements smaller than 24x24px are very difficult to click/tap.` });
      }
      if (taps.tooSmall.length > 3) {
        findings.push({ severity: "warn", category: "tiny-tap-target",
          message: `${taps.tooSmall.length - 3} more interactive elements are smaller than 24x24px.` });
      }
    }
    if (taps.tooCrowded.length > 0) {
      const shown = taps.tooCrowded.slice(0, 3);
      for (const t of shown) {
        findings.push({ severity: "info", category: "crowded-tap-targets",
          message: `"${t.selectorA}" and "${t.selectorB}" are only ${t.gap}px apart. Adjacent tap targets should have at least 8px spacing.` });
      }
      if (taps.tooCrowded.length > 3) {
        findings.push({ severity: "info", category: "crowded-tap-targets",
          message: `${taps.tooCrowded.length - 3} more pairs of interactive elements are too close together.` });
      }
    }

    // ── Sibling Misalignment ──
    const alignment = analyses.alignment;
    if (alignment.length > 0) {
      const shown = alignment.slice(0, 5);
      for (const a of shown) {
        findings.push({ severity: "warn", category: "misaligned-siblings",
          message: `"${a.childA}" and "${a.childB}" (in "${a.parentSelector}") have ${a.axis} edges ${a.offset}px off. Siblings in the same row/column should align exactly.` });
      }
      if (alignment.length > 5) {
        findings.push({ severity: "warn", category: "misaligned-siblings",
          message: `${alignment.length - 5} more sibling element pairs are slightly misaligned (1-3px off).` });
      }
    }

    // ── Inconsistent Gaps ──
    const gaps = analyses.gaps;
    for (const g of gaps.slice(0, 5)) {
      findings.push({ severity: "warn", category: "inconsistent-gap",
        message: `"${g.parentSelector}": ${g.childCount} repeated items have inconsistent ${g.direction} gaps (${g.gaps.join(", ")}px). Median is ${g.meanGap}px, max deviation is ${g.maxDeviation}px. Gaps should be uniform.` });
    }

    // ── Line Length ──
    const textLikeTags = new Set(["p", "li", "div", "blockquote", "dd"]);
    for (const item of elements) {
      if (!textLikeTags.has(item.tag)) continue;
      if (!hasDirectText(item.el)) continue;
      if (item.rect.width < 200) continue;
      const fontSize = parseFloat(item.styles.fontSize);
      if (fontSize < 10) continue;
      const estimatedChars = item.rect.width / (fontSize * 0.5);
      if (estimatedChars > 75) {
        findings.push({ severity: "info", category: "line-too-long",
          message: `"${item.selector}" has ~${Math.round(estimatedChars)} characters per line (${item.rect.width}px wide at ${item.styles.fontSize}). Optimal line length is 45-75 characters for readability.` });
      }
    }
    // Cap line-length findings
    const lineLengthFindings = findings.filter((f) => f.category === "line-too-long");
    if (lineLengthFindings.length > 5) {
      const excess = lineLengthFindings.slice(5);
      for (const f of excess) findings.splice(findings.indexOf(f), 1);
      findings.push({ severity: "info", category: "line-too-long",
        message: `${lineLengthFindings.length - 5} more text blocks exceed the recommended 75-character line length.` });
    }

    // ── Line-Height Too Tight ──
    const blockTags = new Set(["p", "li", "div", "td", "dd", "blockquote"]);
    const tightLineHeightFound = [];
    for (const item of elements) {
      if (!blockTags.has(item.tag)) continue;
      if (!hasDirectText(item.el)) continue;
      const fontSize = parseFloat(item.styles.fontSize);
      let lineHeight = parseFloat(item.styles.lineHeight);
      if (item.styles.lineHeight === "normal") lineHeight = fontSize * 1.2;
      if (isNaN(lineHeight) || lineHeight === 0) continue;
      const ratio = lineHeight / fontSize;
      // Only flag multi-line elements
      if (item.rect.height > lineHeight * 1.5 && ratio < 1.2) {
        tightLineHeightFound.push(item);
      }
    }
    for (const item of tightLineHeightFound.slice(0, 5)) {
      const ratio = (parseFloat(item.styles.lineHeight) / parseFloat(item.styles.fontSize)).toFixed(2);
      findings.push({ severity: "warn", category: "tight-line-height",
        message: `"${item.selector}" has line-height ratio of ${ratio} (${item.styles.lineHeight} / ${item.styles.fontSize}). Multi-line text should have at least 1.2x line-height for readability. WCAG recommends 1.5x for body text.` });
    }
    if (tightLineHeightFound.length > 5) {
      findings.push({ severity: "warn", category: "tight-line-height",
        message: `${tightLineHeightFound.length - 5} more text blocks have line-height below 1.2x their font size.` });
    }

    // ── Text Truncation ──
    const truncation = analyses.truncation;
    const ellipsis = truncation.filter((t) => t.type === "ellipsis");
    const clipped = truncation.filter((t) => t.type === "clipped");

    for (const t of clipped.slice(0, 5)) {
      findings.push({ severity: "warn", category: "text-clipped",
        message: `"${t.selector}" has text silently clipped without ellipsis (overflow:hidden). Content is ${t.scrollWidth}px wide but container is ${t.clientWidth}px. Add text-overflow:ellipsis or increase container size.` });
    }
    if (clipped.length > 5) {
      findings.push({ severity: "warn", category: "text-clipped",
        message: `${clipped.length - 5} more elements have silently clipped text.` });
    }
    if (ellipsis.length > 3) {
      findings.push({ severity: "info", category: "text-truncated",
        message: `${ellipsis.length} elements are showing ellipsis (text-overflow). Verify the truncated content isn't critical information.` });
    }

    // ── Z-Index Issues ──
    const zIndex = analyses.zIndex;
    if (zIndex.blockedInteractive.length > 0) {
      for (const b of zIndex.blockedInteractive.slice(0, 3)) {
        findings.push({ severity: "error", category: "blocked-interactive",
          message: `"${b.blockedSelector}" (z-index:${b.interactiveZ}) is covered by "${b.blockerSelector}" (z-index:${b.blockerZ}). Users cannot click this element.` });
      }
    }
    if (zIndex.excessiveZIndex.length > 3) {
      findings.push({ severity: "info", category: "excessive-z-index",
        message: `${zIndex.excessiveZIndex.length} non-interactive elements have z-index > 100 (up to ${Math.max(...zIndex.excessiveZIndex.map((z) => z.zIndex))}). High z-index values indicate stacking context issues. Simplify the z-index scale.` });
    }

    // ── Section Spacing ──
    const sectionSpacing = analyses.sectionSpacing;
    for (const s of sectionSpacing.slice(0, 3)) {
      findings.push({ severity: "warn", category: "inconsistent-section-spacing",
        message: `Gap between "${s.sectionA}" and "${s.sectionB}" is ${s.gap}px but the median section gap is ${s.medianGap}px. Section spacing should be consistent for visual rhythm.` });
    }

    // ── Icon Consistency (within same context) ──
    const icons = analyses.icons;
    if (icons.inconsistentWithinContext.length > 0) {
      const shown = icons.inconsistentWithinContext.slice(0, 5);
      for (const i of shown) {
        findings.push({ severity: "warn", category: "inconsistent-icon-size",
          message: `Icon "${i.selector}" is ${i.width}x${i.height}px but other icons in the same area are ${i.dominantSize}. Icons within the same context should be a consistent size.` });
      }
    }
    if (icons.misaligned.length > 0) {
      for (const i of icons.misaligned.slice(0, 3)) {
        findings.push({ severity: "warn", category: "misaligned-icon",
          message: `Icon "${i.iconSelector}" is ${i.offset}px off-center from adjacent text "${i.textSelector}". Icons should be vertically centered with their label.` });
      }
    }

    // ── Nested Scrolling ──
    const nested = analyses.nestedScroll;
    for (const n of nested.slice(0, 3)) {
      findings.push({ severity: "warn", category: "nested-scroll",
        message: `"${n.innerSelector}" is a scrollable container nested inside "${n.outerSelector}" (also scrollable). Nested scrollable areas create scroll traps that confuse users.` });
    }
    if (nested.length > 3) {
      findings.push({ severity: "warn", category: "nested-scroll",
        message: `${nested.length - 3} more nested scrollable containers detected.` });
    }

    // ── Form Labels ──
    const labels = analyses.labels;
    if (labels.length > 0) {
      for (const l of labels.slice(0, 5)) {
        findings.push({ severity: "error", category: "missing-label",
          message: `"${l.selector}" (${l.type}) has no visible label, aria-label, aria-labelledby, or title. Screen readers and users cannot identify this field. Add a <label> or aria-label.` });
      }
      if (labels.length > 5) {
        findings.push({ severity: "error", category: "missing-label",
          message: `${labels.length - 5} more form fields are missing accessible labels.` });
      }
    }

    // ── Cramped Padding ──
    const cramped = analyses.crampedPadding;
    if (cramped.length > 0) {
      for (const c of cramped.slice(0, 5)) {
        findings.push({ severity: "warn", category: "cramped-padding",
          message: `"${c.selector}" has text (${c.fontSize}px) pressed against its borders (padding: ${c.padding}px). Cramped sides: ${c.crampedSides.join(", ")}. Use at least ${c.minRecommended}px padding for comfortable reading.` });
      }
      if (cramped.length > 5) {
        findings.push({ severity: "warn", category: "cramped-padding",
          message: `${cramped.length - 5} more containers have insufficient padding around their text content.` });
      }
    }

    // ── Nested Panels ──
    const nestedPanels = analyses.nestedPanels;
    if (nestedPanels.length > 0) {
      const shown = nestedPanels.slice(0, 5);
      for (const p of shown) {
        findings.push({ severity: "warn", category: "nested-panel",
          message: `"${p.innerSelector}" (${p.innerSize}) is a bordered/shadowed panel nested inside "${p.outerSelector}" (${p.outerSize}). Panel-in-panel creates visual clutter — consider flattening the hierarchy or removing the inner container's border/background.` });
      }
      if (nestedPanels.length > 5) {
        findings.push({ severity: "warn", category: "nested-panel",
          message: `${nestedPanels.length - 5} more nested panel-in-panel instances detected. Excessive nesting adds visual weight and reduces content hierarchy clarity.` });
      }
    }

    // ── Adjacent Panels ──
    const adjacentPanels = analyses.adjacentPanels;
    for (const p of adjacentPanels.slice(0, 5)) {
      findings.push({ severity: "warn", category: "adjacent-panels",
        message: `"${p.selectorA}" and "${p.selectorB}" are only ${p.gap}px apart. Bordered panels stacked this close create visual tension — add at least 8px spacing between them.` });
    }
    if (adjacentPanels.length > 5) {
      findings.push({ severity: "warn", category: "adjacent-panels",
        message: `${adjacentPanels.length - 5} more pairs of adjacent panels are nearly touching.` });
    }

    // ── Rounded Border Sprawl ──
    const roundedSprawl = analyses.roundedBorderSprawl;
    if (roundedSprawl.tooManyVariants) {
      const radii = roundedSprawl.distinctRadii.map((r) => `${r} (${roundedSprawl.radiusCounts[r]}x)`).join(", ");
      findings.push({ severity: "warn", category: "border-radius-sprawl",
        message: `${roundedSprawl.distinctRadii.length} distinct border-radius values on large containers: ${radii}. A design system typically uses 2-3 radius values. Consolidate to a consistent rounding scale.` });
    }
    if (roundedSprawl.overuse) {
      findings.push({ severity: "info", category: "rounded-panel-overuse",
        message: `${roundedSprawl.totalRoundedPanels} large containers have rounded corners. Excessive rounding can make the UI feel cluttered — consider using sharp corners for outer containers and reserving rounding for inner cards/components.` });
    }

    // ── Color Palette Harmony ──
    // (palette already declared above in contrast section)
    if (palette.mainColorCount >= 2) {
      const srcLabel = palette.paletteSource === "css-variables" ? "CSS custom properties" : "hardcoded colors";
      const hueList = palette.roleHues.map(r => `${r.role}: ${r.hex} (${Math.round(r.hue)}°)`).join(", ");

      // Build shade scale summary for the detected message
      const scaleSnippets = [];
      for (const rh of palette.roleHues) {
        const scale = palette.shadeScales[rh.role];
        if (scale) {
          const s50 = scale.find(s => s.shade === 50);
          const s500 = scale.find(s => s.shade === 500);
          const s900 = scale.find(s => s.shade === 900);
          if (s50 && s500 && s900) {
            scaleSnippets.push(`${rh.role}: ${s50.hex}→${s500.hex}→${s900.hex}`);
          }
        }
      }

      findings.push({ severity: "info", category: "palette-detected",
        message: `Detected ${palette.mainColorCount} main palette colors from ${srcLabel}: ${hueList}. Best-matching color wheel strategy: ${palette.bestStrategy} (alignment: ${palette.alignmentScore}%).` });

      if (scaleSnippets.length > 0) {
        findings.push({ severity: "info", category: "palette-shades",
          message: `Generated shade scales (50→500→900): ${scaleSnippets.join(" | ")}. Use lighter shades (50-200) for backgrounds and darker shades (700-900) for text to maintain palette cohesion and WCAG contrast.` });
      }

      if (palette.alignmentScore !== null && palette.alignmentScore < 60) {
        findings.push({ severity: "warn", category: "palette-harmony",
          message: `Palette colors are poorly aligned on the color wheel (${palette.alignmentScore}% alignment to "${palette.bestStrategy}" strategy, avg offset: ${palette.avgOffset}°). Colors may look arbitrary rather than intentional.` });
      }

      for (const s of palette.suggestions) {
        const severity = s.offset > 25 ? "warn" : "info";
        // Include the full shade scale for the suggested color
        const suggestedOklch = rgbToOklch(...oklchToRgb(s.currentHue ? palette.roleHues.find(r => r.role === s.role)?.L || 0.5 : 0.5, palette.roleHues.find(r => r.role === s.role)?.C || 0.15, s.targetHue));
        const suggestedShades = generateShades(suggestedOklch[0], suggestedOklch[1], s.targetHue);
        const s50 = shadeToHex(suggestedShades.find(sh => sh.shade === 50));
        const s500 = s.suggestedHex;
        const s900 = shadeToHex(suggestedShades.find(sh => sh.shade === 900));

        findings.push({ severity, category: "palette-suggestion",
          message: `${s.role}: hue ${s.currentHue}° is ${s.offset}° off the ideal "${palette.bestStrategy}" position (${s.targetHue}°). Current: ${s.currentHex} → suggested: ${s500} (shades: ${s50}→${s500}→${s900}).` });
      }
    }

    // ── Surface / Background Layer Consistency ──
    if (palette.surfaceLayers && palette.surfaceLayers.length > 0) {
      for (const group of palette.surfaceLayers) {
        const layerList = group.layers.map(l => `${l.name}: ${l.hex} (L:${l.L})`).join(", ");

        findings.push({ severity: "info", category: "surface-layers",
          message: `Detected ${group.layers.length} surface/background layers (sorted by lightness): ${layerList}. Lightness steps: ${group.lightnessSteps.map(s => (s * 100).toFixed(1) + "%").join(", ")}.` });

        if (group.stepConsistency < 50 && group.lightnessSteps.length >= 2) {
          const steps = group.lightnessSteps.map(s => (s * 100).toFixed(1) + "%").join(", ");
          findings.push({ severity: "warn", category: "surface-step-consistency",
            message: `Surface layers have uneven lightness steps (${steps}). Consistent spacing creates a more predictable elevation system. Step consistency: ${group.stepConsistency}%.` });

          if (group.suggestedLayers.length > 0) {
            const suggested = group.suggestedLayers.map(l => `${l.shade}: ${l.hex}`).join(", ");
            findings.push({ severity: "info", category: "surface-suggestion",
              message: `Suggested evenly-spaced layers: ${suggested}.` });
          }
        }

        if (!group.hueConsistent) {
          findings.push({ severity: "warn", category: "surface-hue-drift",
            message: `Surface layers have inconsistent hue — the tint color shifts between layers. Surface/background tokens should maintain the same hue for visual cohesion.` });
        }
      }
    }

    // Sort: errors first, then warns, then info
    const severityOrder = { error: 0, warn: 1, info: 2 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Tag findings with componentId by extracting selector from message
    for (const f of findings) {
      if (f.componentId) continue;
      // Messages reference selectors as "selector" (quoted)
      const m = f.message.match(/^"([^"]+)"/);
      if (m) {
        const eid = selectorToUxlyId[m[1]];
        if (eid && elementToComponent[eid]) {
          f.componentId = elementToComponent[eid];
        }
      }
    }

    return findings;
  }

  // ─── Scoring ──────────────────────────────────────────────

  function computeScore(findings) {
    // Group findings by category — only errors and warns count against the score
    // Info findings are observations, not problems
    const byCategory = {};
    for (const f of findings) {
      if (f.severity === "info") continue; // info doesn't penalize
      if (!byCategory[f.category]) byCategory[f.category] = [];
      byCategory[f.category].push(f);
    }

    let deductions = 0;
    const severityBase = { error: 5, warn: 2 };

    for (const [category, items] of Object.entries(byCategory)) {
      // First finding in a category gets full weight, subsequent get heavy diminishing
      // This means 5 issues in one category ≈ 2 issues in different categories
      for (let i = 0; i < items.length; i++) {
        const base = severityBase[items[i].severity] || 0;
        const diminish = 1 / (1 + i); // 1st: 100%, 2nd: 50%, 3rd: 33%, 4th: 25%
        deductions += base * diminish;
      }
    }

    // Cap deductions at 100 — score is 0-100
    return Math.max(0, Math.min(100, Math.round(100 - deductions)));
  }

  // ─── Run ──────────────────────────────────────────────────

  const elements = collectElements();
  const consistency = analyzeConsistency(elements);
  const visualUnits = detectVisualUnits(elements);
  const detectedCharts = detectCharts();

  // Add detected charts as visual units (they're SVGs, so not in the element pipeline)
  for (const chart of detectedCharts) {
    visualUnits.push({
      type: "chart",
      rect: chart.rect,
      memberCount: chart.shapeCount,
      selector: chart.selector,
      members: [{ tag: "svg", selector: chart.selector, rect: chart.rect }],
    });
  }

  const analyses = {
    spacing: analyzeSpacing(elements),
    contrast: analyzeContrast(elements),
    tapTargets: analyzeTapTargets(elements),
    alignment: analyzeSiblingAlignment(elements),
    gaps: analyzeRepeatedItemGaps(elements),
    truncation: analyzeTextTruncation(elements),
    zIndex: analyzeZIndex(elements),
    sectionSpacing: analyzeSectionSpacing(elements),
    icons: analyzeIconConsistency(),
    nestedScroll: analyzeNestedScrolling(elements),
    labels: analyzeFormLabels(elements),
    crampedPadding: analyzeCrampedPadding(elements),
    nestedPanels: analyzeNestedPanels(elements),
    adjacentPanels: analyzeAdjacentPanels(elements),
    roundedBorderSprawl: analyzeRoundedBorderSprawl(elements),
    palette: analyzePalette(),
    charts: detectedCharts,
  };

  // Build element → component mapping (smallest containing component wins)
  // Flatten all units (including nested children) sorted smallest-first
  const allFlatUnits = [];
  (function flattenUnits(units) {
    for (const u of units) {
      if (u.children) flattenUnits(u.children);
      allFlatUnits.push(u);
    }
  })(visualUnits);
  allFlatUnits.sort((a, b) => rectArea(a.rect) - rectArea(b.rect));

  // Map each element's uxlyId to its smallest containing component's uxlyId
  const elementToComponent = {};
  for (const item of elements) {
    const elId = getUxlyId(item.el);
    if (!elId) continue;
    for (const u of allFlatUnits) {
      if (u.outerElement && u.outerElement.contains(item.el)) {
        elementToComponent[elId] = u.uxlyId;
        break;
      }
    }
  }

  const findings = generateFindings(consistency, elements, analyses, elementToComponent);
  const score = computeScore(findings);

  const result = {
    url: location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    score,
    totalElementsAnalyzed: elements.length,
    findings,
    consistency,
    analyses,
    visualUnits: visualUnits.map(function serializeUnit(u) {
      return {
        type: u.type, rect: u.rect,
        memberCount: u.memberCount, ownMemberCount: u.ownMemberCount ?? u.memberCount,
        selector: u.selector, uxlyId: u.uxlyId,
        members: u.members,
        children: (u.children || []).map(serializeUnit),
      };
    }),
    summary: {
      componentCounts: {},
      findingCounts: { error: 0, warn: 0, info: 0 },
    },
  };

  for (const u of visualUnits) {
    result.summary.componentCounts[u.type] = (result.summary.componentCounts[u.type] || 0) + 1;
  }
  for (const f of findings) {
    result.summary.findingCounts[f.severity]++;
  }

  // When loaded via script tag, expose result globally for test pages
  if (typeof window !== 'undefined') window.uxlyResult = result;

  // ─── Pixel-based contrast refinement ────────────────────────
  // Three-step workflow for accurate background color sampling:
  //   1. Call window.uxlyHideText() — makes all text invisible so the screenshot shows only backgrounds
  //   2. Take a screenshot externally (CDP, extension captureVisibleTab, etc.)
  //   3. Call window.uxlyRestoreText() — restores text visibility
  //   4. Call window.uxlyRefineWithScreenshot(dataUrl) — samples background pixels from the clean screenshot

  if (typeof window !== 'undefined') {
    const _savedColors = new Map();

    window.uxlyHideText = function() {
      _savedColors.clear();
      for (const item of elements) {
        if (!hasDirectText(item.el)) continue;
        _savedColors.set(item.el, item.el.style.color);
        item.el.style.color = 'transparent';
      }
      return _savedColors.size;
    };

    window.uxlyRestoreText = function() {
      for (const [el, original] of _savedColors) {
        el.style.color = original;
      }
      _savedColors.clear();
    };

    window.uxlyRefineWithScreenshot = async function(dataUrl) {
      // 1. Load the clean (text-hidden) screenshot into a canvas
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const dpr = window.devicePixelRatio || 1;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 2. Sample background color from the clean screenshot
      function sampleBackground(rect) {
        // Sample a grid of points within the element — no text to worry about
        const samplePoints = [];
        const cols = 3, rows = 3;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = rect.left + (rect.width * (c + 0.5)) / cols;
            const y = rect.top + (rect.height * (r + 0.5)) / rows;
            samplePoints.push([x, y]);
          }
        }

        const bgPixels = [];
        for (const [x, y] of samplePoints) {
          const px = Math.round(x * dpr);
          const py = Math.round(y * dpr);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
          const data = ctx.getImageData(px, py, 1, 1).data;
          bgPixels.push({ r: data[0], g: data[1], b: data[2] });
        }

        if (bgPixels.length === 0) return null;

        // Return the median color (by luminance) to handle gradient edges
        bgPixels.sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
        return bgPixels[Math.floor(bgPixels.length / 2)];
      }

      // 3. Re-analyze contrast for all text elements using pixel sampling
      const newContrast = [];
      for (const item of elements) {
        if (!hasDirectText(item.el)) continue;
        const visibleText = item.el.textContent.trim();
        if (!visibleText) continue;
        if (item.rect.width < 2 || item.rect.height < 2) continue;

        // Only check elements in the viewport
        if (item.rect.bottom < 0 || item.rect.top > vh) continue;
        if (item.rect.right < 0 || item.rect.left > vw) continue;

        const fg = parseColor(item.styles.color);
        if (!fg) continue;

        const bg = sampleBackground(item.rect);
        if (!bg) continue;

        const ratio = contrastRatio(relativeLuminance(fg), relativeLuminance(bg));
        const fontSize = parseFloat(item.styles.fontSize);
        const fontWeight = parseInt(item.styles.fontWeight) || 400;
        const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
        const required = isLarge ? 3 : 4.5;

        if (ratio < required) {
          newContrast.push({
            selector: item.selector, tag: item.tag,
            fontSize: item.styles.fontSize, fontWeight: item.styles.fontWeight,
            fgColor: item.styles.color,
            bgColor: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
            bgSource: "pixel-sampled",
            ratio: Math.round(ratio * 100) / 100, required, isLarge,
          });
        }
      }

      // 4. Rebuild findings with pixel-sampled contrast
      const refinedFindings = result.findings.filter(f => f.category !== "low-contrast");
      const palette = result.analyses.palette;

      for (const c of newContrast.slice(0, 5)) {
        let suggestion = "";
        if (palette && palette.roleHues && palette.shadeScales) {
          const fgRgb = parseColor(c.fgColor);
          const bgRgb = parseColor(c.bgColor);
          if (fgRgb && bgRgb) {
            const fgOklch = rgbToOklch(fgRgb.r, fgRgb.g, fgRgb.b);
            const bgOklch = rgbToOklch(bgRgb.r, bgRgb.g, bgRgb.b);
            let matchRole = null, matchDist = Infinity, fixTarget = "fg";
            for (const rh of palette.roleHues) {
              const dFg = hueDist(fgOklch[2], rh.hue);
              const dBg = hueDist(bgOklch[2], rh.hue);
              if (dFg < matchDist) { matchDist = dFg; matchRole = rh.role; fixTarget = "fg"; }
              if (dBg < matchDist) { matchDist = dBg; matchRole = rh.role; fixTarget = "bg"; }
            }
            if (matchRole && matchDist < 40 && palette.shadeScales[matchRole]) {
              const shades = palette.shadeScales[matchRole].map(s => ({ shade: s.shade, L: s.L, C: s.C, H: s.H }));
              const targetRgb = fixTarget === "bg" ? fgRgb : bgRgb;
              const fix = findContrastingShade(shades, targetRgb, c.required);
              if (fix) {
                suggestion = ` Try ${matchRole}-${fix.shade} (${fix.hex}) as ${fixTarget === "bg" ? "background" : "text color"} (${fix.ratio}:1 contrast).`;
              }
            }
          }
        }
        refinedFindings.push({
          severity: "error", category: "low-contrast",
          message: `"${c.selector}" has contrast ratio ${c.ratio}:1 (requires ${c.required}:1 for ${c.isLarge ? "large" : "normal"} text). Foreground: ${c.fgColor}, background: ${c.bgColor} (pixel-sampled).${suggestion || " Increase the contrast to meet WCAG AA."}`,
        });
      }
      if (newContrast.length > 5) {
        refinedFindings.push({
          severity: "error", category: "low-contrast",
          message: `${newContrast.length - 5} more elements fail WCAG AA contrast requirements (pixel-sampled).`,
        });
      }

      // Update counts and score
      const findingCounts = { error: 0, warn: 0, info: 0 };
      for (const f of refinedFindings) findingCounts[f.severity]++;

      const refined = {
        ...result,
        findings: refinedFindings,
        summary: { ...result.summary, findingCounts },
        analyses: { ...result.analyses, contrast: newContrast },
        contrastMethod: "pixel-sampled",
        score: computeScore(refinedFindings),
      };

      window.uxlyResult = refined;
      return refined;
    };
  }

  return result;
})();
