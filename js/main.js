/**
 * TechThree — Main JavaScript
 * Handles shared interactions across all pages.
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileMenu();
  initScrollAnimations();
  init3DCardTilt();
  initActiveNav();
});

/**
 * Navbar scroll effect — adds background blur after scrolling.
 */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  const updateNavbar = () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  updateNavbar();
  window.addEventListener('scroll', updateNavbar, { passive: true });
}

/**
 * Mobile menu toggle.
 */
function initMobileMenu() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');

  if (!menuBtn || !navLinks) return;

  const setMenuState = (isOpen) => {
    navLinks.classList.toggle('open', isOpen);
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    const isMobile = window.innerWidth <= 768;
    navLinks.setAttribute('aria-hidden', String(isMobile && !isOpen));
    navLinks.inert = isMobile && !isOpen;
    document.body.classList.toggle('nav-open', isOpen);

    if (isOpen) {
      navLinks.querySelector('a')?.focus();
    }
  };

  const updateNavAccessibility = () => {
    const isMobile = window.innerWidth <= 768;
    const isOpen = navLinks.classList.contains('open');
    navLinks.setAttribute('aria-hidden', String(isMobile && !isOpen));
    navLinks.inert = isMobile && !isOpen;
  };

  updateNavAccessibility();

  menuBtn.addEventListener('click', () => {
    setMenuState(!navLinks.classList.contains('open'));
  });

  // Close menu when clicking a link.
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setMenuState(false));
  });

  // Keep keyboard and viewport interactions from leaving the menu stuck open.
  document.addEventListener('keydown', (event) => {
    if (!navLinks.classList.contains('open')) return;

    if (event.key === 'Escape') {
      setMenuState(false);
      menuBtn.focus();
      return;
    }

    if (event.key === 'Tab') {
      const focusableLinks = [...navLinks.querySelectorAll('a')];
      const firstLink = focusableLinks[0];
      const lastLink = focusableLinks[focusableLinks.length - 1];

      if (event.shiftKey && document.activeElement === firstLink) {
        event.preventDefault();
        lastLink.focus();
      } else if (!event.shiftKey && document.activeElement === lastLink) {
        event.preventDefault();
        firstLink.focus();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && navLinks.classList.contains('open')) {
      setMenuState(false);
    }
    updateNavAccessibility();
  }, { passive: true });
}

/**
 * Scroll animations using IntersectionObserver.
 */
function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('.animate-on-scroll');
  if (animatedElements.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    }
  );

  animatedElements.forEach((el) => observer.observe(el));
}

/**
 * 3D tilt effect for cards on mouse move.
 */
function init3DCardTilt() {
  if (window.matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)').matches) return;

  const cards = document.querySelectorAll('.card-3d');

  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    });
  });
}

/**
 * Highlight the active nav link based on current page.
 */
function initActiveNav() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-links a');

  navLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}
