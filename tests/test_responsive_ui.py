from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def test_base_template_has_mobile_navigation_controls():
    html = read("templates/base.html")

    assert '<meta name="viewport" content="width=device-width, initial-scale=1.0">' in html
    assert 'class="mobile-nav-toggle"' in html
    assert 'aria-label="Open navigation"' in html
    assert 'aria-expanded="false"' in html
    assert 'class="sidebar-backdrop"' in html
    assert "document.body.classList.toggle('nav-open', open)" in html
    assert "_backdrop?.addEventListener('click'" in html


def test_legacy_css_keeps_sidebar_off_canvas_on_small_screens():
    css = read("static/styles.css")

    assert "@media (max-width: 900px)" in css
    assert ".mobile-nav-toggle" in css
    assert "body.nav-open .sidebar" in css
    assert "transform: translateX(-105%)" in css
    assert "body.nav-open .sidebar-backdrop" in css
    assert "table { min-width: 680px; }" in css
    assert "@media (max-width: 560px)" in css


def test_react_shell_exposes_responsive_drawer_behaviour():
    shell = read("static/src/shell.jsx")
    app = read("static/src/app.jsx")
    icons = read("static/src/icons.jsx")

    assert "const useViewport" in shell
    assert "isMobile: window.innerWidth < 720" in shell
    assert "isTablet: window.innerWidth < 980" in shell
    assert 'Icon name="menu"' in shell
    assert 'aria-label="Open navigation"' in shell
    assert "onClose()" in shell
    assert "useViewport" in app
    assert "setNavOpen(false)" in app
    assert 'case "menu"' in icons
