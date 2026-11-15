const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-navigation");

if (menuToggle && navigation) {
    const closeMenu = () => {
        menuToggle.setAttribute("aria-expanded", "false");
        navigation.classList.remove("is-open");
    };

    menuToggle.addEventListener("click", () => {
        const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!isExpanded));
        navigation.classList.toggle("is-open", !isExpanded);
    });

    navigation.addEventListener("click", (event) => {
        if (event.target instanceof HTMLAnchorElement) {
            closeMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
            menuToggle.focus();
        }
    });
}

const copyrightYear = document.querySelector("#copyright-year");
if (copyrightYear) {
    copyrightYear.textContent = String(new Date().getFullYear());
}

const portfolioCarousel = document.querySelector(".portfolio-carousel");
if (portfolioCarousel) {
    const track = portfolioCarousel.querySelector(".portfolio-track");
    const slides = [...portfolioCarousel.querySelectorAll(".portfolio-item")];
    const previousButton = portfolioCarousel.querySelector("[data-portfolio-previous]");
    const nextButton = portfolioCarousel.querySelector("[data-portfolio-next]");
    const pauseButton = portfolioCarousel.querySelector(".portfolio-pause");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeSlide = 0;
    let autoplayTimer;
    let autoplayPaused = false;

    const visibleSlides = () => Number.parseInt(
        window.getComputedStyle(portfolioCarousel).getPropertyValue("--portfolio-visible"),
        10
    ) || 3;

    const showSlide = (index) => {
        const lastStart = Math.max(0, slides.length - visibleSlides());
        activeSlide = index > lastStart ? 0 : index < 0 ? lastStart : index;
        track.style.transform = `translateX(-${slides[activeSlide].offsetLeft}px)`;

        slides.forEach((slide, slideIndex) => {
            const isVisible = slideIndex >= activeSlide && slideIndex < activeSlide + visibleSlides();
            slide.setAttribute("aria-hidden", String(!isVisible));
        });
    };

    const stopAutoplay = () => {
        window.clearInterval(autoplayTimer);
        autoplayTimer = undefined;
    };

    const startAutoplay = () => {
        stopAutoplay();
        if (
            !autoplayPaused &&
            !reducedMotion.matches &&
            !document.hidden &&
            !portfolioCarousel.matches(":hover") &&
            !portfolioCarousel.contains(document.activeElement)
        ) {
            autoplayTimer = window.setInterval(() => showSlide(activeSlide + 1), 4500);
        }
    };

    const move = (direction) => {
        showSlide(activeSlide + direction);
        startAutoplay();
    };

    previousButton.addEventListener("click", () => move(-1));
    nextButton.addEventListener("click", () => move(1));

    pauseButton.addEventListener("click", () => {
        autoplayPaused = !autoplayPaused;
        pauseButton.setAttribute("aria-pressed", String(autoplayPaused));
        pauseButton.setAttribute("aria-label", autoplayPaused ? "Start automatic rotation" : "Pause automatic rotation");
        pauseButton.textContent = autoplayPaused ? "Play" : "Pause";
        startAutoplay();
    });

    portfolioCarousel.addEventListener("mouseenter", stopAutoplay);
    portfolioCarousel.addEventListener("mouseleave", startAutoplay);
    portfolioCarousel.addEventListener("focusin", stopAutoplay);
    portfolioCarousel.addEventListener("focusout", (event) => {
        if (!portfolioCarousel.contains(event.relatedTarget)) {
            startAutoplay();
        }
    });

    window.addEventListener("resize", () => showSlide(activeSlide));
    document.addEventListener("visibilitychange", startAutoplay);
    reducedMotion.addEventListener("change", startAutoplay);
    showSlide(0);
    startAutoplay();
}

const testimonialsCarousel = document.querySelector(".testimonials-carousel");
if (testimonialsCarousel) {
    const track = testimonialsCarousel.querySelector(".testimonials-track");
    const slides = [...testimonialsCarousel.querySelectorAll(".testimonial-card")];
    const dots = [...testimonialsCarousel.querySelectorAll(".testimonial-dot")];
    const previousButton = testimonialsCarousel.querySelector("[data-testimonial-previous]");
    const nextButton = testimonialsCarousel.querySelector("[data-testimonial-next]");
    const pauseButton = testimonialsCarousel.querySelector(".testimonial-pause");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeSlide = 0;
    let autoplayTimer;
    let pointerStart;
    let autoplayPaused = false;

    const showSlide = (index, announce = false) => {
        activeSlide = (index + slides.length) % slides.length;
        track.style.transform = `translateX(-${activeSlide * 100}%)`;
        track.setAttribute("aria-live", announce ? "polite" : "off");

        slides.forEach((slide, slideIndex) => {
            slide.setAttribute("aria-hidden", String(slideIndex !== activeSlide));
        });

        dots.forEach((dot, dotIndex) => {
            const isActive = dotIndex === activeSlide;
            dot.classList.toggle("is-active", isActive);
            dot.setAttribute("aria-current", String(isActive));
        });
    };

    const stopAutoplay = () => {
        window.clearInterval(autoplayTimer);
        autoplayTimer = undefined;
    };

    const startAutoplay = () => {
        stopAutoplay();
        if (!autoplayPaused && !reducedMotion.matches && !document.hidden) {
            autoplayTimer = window.setInterval(() => showSlide(activeSlide + 1), 5500);
        }
    };

    pauseButton.addEventListener("click", () => {
        autoplayPaused = !autoplayPaused;
        pauseButton.setAttribute("aria-pressed", String(autoplayPaused));
        pauseButton.setAttribute("aria-label", autoplayPaused ? "Start automatic rotation" : "Pause automatic rotation");
        pauseButton.textContent = autoplayPaused ? "Play" : "Pause";
        startAutoplay();
    });

    previousButton.addEventListener("click", () => {
        showSlide(activeSlide - 1, true);
        startAutoplay();
    });

    nextButton.addEventListener("click", () => {
        showSlide(activeSlide + 1, true);
        startAutoplay();
    });

    dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
            showSlide(index, true);
            startAutoplay();
        });
    });

    testimonialsCarousel.addEventListener("mouseenter", stopAutoplay);
    testimonialsCarousel.addEventListener("mouseleave", startAutoplay);
    testimonialsCarousel.addEventListener("focusin", stopAutoplay);
    testimonialsCarousel.addEventListener("focusout", (event) => {
        if (!testimonialsCarousel.contains(event.relatedTarget)) {
            startAutoplay();
        }
    });

    testimonialsCarousel.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") {
            showSlide(activeSlide - 1, true);
            startAutoplay();
        } else if (event.key === "ArrowRight") {
            showSlide(activeSlide + 1, true);
            startAutoplay();
        }
    });

    const viewport = testimonialsCarousel.querySelector(".testimonials-viewport");
    viewport.addEventListener("pointerdown", (event) => {
        pointerStart = event.clientX;
    });
    viewport.addEventListener("pointerup", (event) => {
        if (pointerStart === undefined) {
            return;
        }

        const distance = event.clientX - pointerStart;
        pointerStart = undefined;
        if (Math.abs(distance) > 45) {
            showSlide(activeSlide + (distance < 0 ? 1 : -1), true);
            startAutoplay();
        }
    });
    viewport.addEventListener("pointercancel", () => {
        pointerStart = undefined;
    });

    document.addEventListener("visibilitychange", startAutoplay);
    reducedMotion.addEventListener("change", startAutoplay);
    showSlide(0);
    startAutoplay();
}
