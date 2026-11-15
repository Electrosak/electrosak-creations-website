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

const viewerDialog = document.querySelector("#viewer-dialog");
if (viewerDialog) {
    const viewerTitle = viewerDialog.querySelector("#viewer-title");
    const viewerDescription = viewerDialog.querySelector("#viewer-description");
    const viewerFileInput = viewerDialog.querySelector("#viewer-file-input");
    const viewerFileLabel = viewerDialog.querySelector("#viewer-file-label");
    const viewerStatus = viewerDialog.querySelector("#viewer-status");
    const stlViewer = viewerDialog.querySelector("#stl-viewer");
    const stlStage = viewerDialog.querySelector("#stl-stage");
    const stlWeightEstimator = viewerDialog.querySelector("#stl-weight-estimator");
    const stlMaterial = viewerDialog.querySelector("#stl-material");
    const stlInfill = viewerDialog.querySelector("#stl-infill");
    const stlInfillValue = viewerDialog.querySelector("#stl-infill-value");
    const stlWeightResult = viewerDialog.querySelector("#stl-weight-result");
    const gerberViewer = viewerDialog.querySelector("#gerber-viewer");
    const gerberLayerList = viewerDialog.querySelector("#gerber-layer-list");
    const gerberStage = viewerDialog.querySelector("#gerber-stage");
    const loadPromises = new Map();
    let activeViewer;
    let stlResources;

    const setViewerStatus = (message, isError = false, isLoading = false) => {
        viewerStatus.textContent = message;
        viewerStatus.dataset.error = String(isError);
        viewerStatus.dataset.loading = String(isLoading);
    };

    let stlVolumeCm3;

    const updateStlWeightEstimate = () => {
        if (stlVolumeCm3 === undefined) {
            return;
        }

        const density = Number(stlMaterial.value);
        const infill = Number(stlInfill.value);
        const solidWeight = stlVolumeCm3 * density;
        const infillWeight = solidWeight * infill / 100;
        stlInfillValue.value = `${infill}%`;
        stlInfillValue.textContent = `${infill}%`;
        stlWeightResult.textContent =
            `Model volume: ${stlVolumeCm3.toFixed(3)} cm³ · ` +
            `solid at 100%: ${solidWeight.toFixed(2)} g · ` +
            `infill material at ${infill}%: ${infillWeight.toFixed(2)} g`;
    };

    const calculateStlVolumeCm3 = (geometry) => {
        const positions = geometry.getAttribute("position");
        const indices = geometry.getIndex();
        let signedVolume = 0;
        const triangleCount = indices ? indices.count / 3 : positions.count / 3;

        for (let triangle = 0; triangle < triangleCount; triangle += 1) {
            const offset = triangle * 3;
            const a = indices ? indices.getX(offset) : offset;
            const b = indices ? indices.getX(offset + 1) : offset + 1;
            const c = indices ? indices.getX(offset + 2) : offset + 2;
            const ax = positions.getX(a);
            const ay = positions.getY(a);
            const az = positions.getZ(a);
            const bx = positions.getX(b);
            const by = positions.getY(b);
            const bz = positions.getZ(b);
            const cx = positions.getX(c);
            const cy = positions.getY(c);
            const cz = positions.getZ(c);

            signedVolume +=
                ax * (by * cz - bz * cy) +
                ay * (bz * cx - bx * cz) +
                az * (bx * cy - by * cx);
        }

        return Math.abs(signedVolume / 6) / 1000;
    };

    const loadScript = (url, globalName) => {
        if (window[globalName]) {
            return Promise.resolve(window[globalName]);
        }

        if (!loadPromises.has(url)) {
            const scriptLoad = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = url;
                script.async = true;
                script.onload = () => {
                    if (window[globalName]) {
                        resolve(window[globalName]);
                    } else {
                        reject(new Error(`The viewer library at ${url} did not initialize.`));
                    }
                };
                script.onerror = () => reject(new Error(`Could not load the viewer library at ${url}.`));
                document.head.append(script);
            });
            loadPromises.set(url, scriptLoad.catch((error) => {
                loadPromises.delete(url);
                throw error;
            }));
        }

        return loadPromises.get(url);
    };

    const clearStlViewer = () => {
        if (!stlResources) {
            return;
        }

        window.cancelAnimationFrame(stlResources.frame);
        stlResources.resizeObserver.disconnect();
        stlResources.controls.dispose();
        stlResources.geometry.dispose();
        stlResources.material.dispose();
        stlResources.renderer.dispose();
        stlResources.renderer.forceContextLoss();
        stlResources.renderer.domElement.remove();
        stlResources = undefined;
    };

    const parseSvgLengthInMm = (value) => {
        const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(mm|cm|in|inch|mil)?$/i.exec(value || "");
        if (!match) {
            throw new Error("A Gerber layer has an unsupported size format.");
        }

        const unit = (match[2] || "mm").toLowerCase();
        const multiplier = unit === "in" || unit === "inch" ? 25.4 : unit === "cm" ? 10 : unit === "mil" ? 0.0254 : 1;
        return Number(match[1]) * multiplier;
    };

    const gerberLayerColors = [
        "#f2b84b",
        "#56b4e9",
        "#e76f9a",
        "#63c1a0",
        "#b28be0",
        "#f08a4b",
        "#8fa9ff",
        "#d4c95c",
        "#e68ad2",
        "#7bc8d4",
        "#f08f8f",
        "#9bc66b"
    ];

    const gerberExtensions = /\.(gbr|ger|gtl|gbl|gts|gbs|gto|gbo|gko|gm\d+|g\d+|drl|xln)$/i;

    const readGerberFile = (name, contents, index, gerberToSvg) => new Promise((resolve, reject) => {
        const id = `electrosak-gerber-layer-${index}`;
        const filetype = /\.(drl|xln)$/i.test(name) || name.toLowerCase().includes("drill") ? "drill" : "gerber";

        try {
            gerberToSvg(contents, { id, filetype }, (error, markup) => {
                if (error) {
                    reject(new Error(`${name}: ${error.message}`));
                    return;
                }

                const parsed = new DOMParser().parseFromString(String(markup), "image/svg+xml");
                const sourceSvg = parsed.documentElement;
                const viewBox = (sourceSvg.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
                if (
                    sourceSvg.localName !== "svg" ||
                    parsed.querySelector("parsererror") ||
                    viewBox.length !== 4 ||
                    !viewBox.every(Number.isFinite) ||
                    viewBox[2] <= 0 ||
                    viewBox[3] <= 0
                ) {
                    reject(new Error(`${name}: the viewer could not read this Gerber layer.`));
                    return;
                }

                const widthMm = parseSvgLengthInMm(sourceSvg.getAttribute("width"));
                const heightMm = parseSvgLengthInMm(sourceSvg.getAttribute("height"));
                if (widthMm <= 0 || heightMm <= 0) {
                    reject(new Error(`${name}: the layer has invalid dimensions.`));
                    return;
                }

                const scale = widthMm / viewBox[2];
                resolve({
                    name,
                    svg: sourceSvg,
                    x: viewBox[0] * scale,
                    y: viewBox[1] * scale,
                    width: viewBox[2] * scale,
                    height: viewBox[3] * scale,
                    color: gerberLayerColors[index % gerberLayerColors.length]
                });
            });
        } catch (error) {
            reject(new Error(`${name}: ${error.message}`));
        }
    });

    const displayGerberLayers = (layers) => {
        const svgNamespace = "http://www.w3.org/2000/svg";
        const bounds = {
            left: Math.min(...layers.map((layer) => layer.x)),
            top: Math.min(...layers.map((layer) => layer.y)),
            right: Math.max(...layers.map((layer) => layer.x + layer.width)),
            bottom: Math.max(...layers.map((layer) => layer.y + layer.height))
        };
        const combinedSvg = document.createElementNS(svgNamespace, "svg");
        combinedSvg.setAttribute("viewBox", `${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}`);
        combinedSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        combinedSvg.setAttribute("role", "img");
        combinedSvg.setAttribute("aria-label", "Combined Gerber board layers");

        gerberLayerList.replaceChildren();
        layers.forEach((layer, index) => {
            const importedSvg = document.importNode(layer.svg, true);
            importedSvg.setAttribute("x", String(layer.x));
            importedSvg.setAttribute("y", String(layer.y));
            importedSvg.setAttribute("width", String(layer.width));
            importedSvg.setAttribute("height", String(layer.height));
            importedSvg.setAttribute("preserveAspectRatio", "none");
            importedSvg.style.color = layer.color;
            importedSvg.style.opacity = "0.78";
            combinedSvg.append(importedSvg);

            const label = document.createElement("label");
            label.className = "gerber-layer-toggle";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.setAttribute("aria-label", `Show ${layer.name}`);
            checkbox.addEventListener("change", () => {
                importedSvg.style.display = checkbox.checked ? "" : "none";
            });
            const swatch = document.createElement("span");
            swatch.className = "gerber-layer-swatch";
            swatch.style.backgroundColor = layer.color;
            const name = document.createElement("span");
            name.textContent = layer.name;
            label.append(checkbox, swatch, name);
            gerberLayerList.append(label);
        });

        gerberStage.replaceChildren(combinedSvg);
        gerberViewer.hidden = false;
    };

    const showStlFile = async (file) => {
        if (file.size > 50 * 1024 * 1024) {
            throw new Error("Please choose an STL file smaller than 50 MB.");
        }

        setViewerStatus("Please wait while your STL model is being loaded...", false, true);
        const [THREE, { STLLoader }, { OrbitControls }] = await Promise.all([
            import("https://esm.sh/three@0.180.0"),
            import("https://esm.sh/three@0.180.0/examples/jsm/loaders/STLLoader.js"),
            import("https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js")
        ]);
        const geometry = new STLLoader().parse(await file.arrayBuffer());
        if (!geometry.getAttribute("position") || geometry.getAttribute("position").count === 0) {
            geometry.dispose();
            throw new Error("This STL file does not contain a 3D model.");
        }
        stlVolumeCm3 = calculateStlVolumeCm3(geometry);

        clearStlViewer();
        stlStage.replaceChildren();
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        } catch (error) {
            geometry.dispose();
            throw new Error("This browser could not start WebGL for the 3D viewer.");
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(stlStage.clientWidth, stlStage.clientHeight);
        renderer.setClearColor("#f3eff8");
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        stlStage.append(renderer.domElement);

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const dimensions = geometry.boundingBox.getSize(new THREE.Vector3());
        const center = geometry.boundingBox.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.computeBoundingSphere();

        const radius = geometry.boundingSphere.radius || 1;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#f3eff8");
        const camera = new THREE.PerspectiveCamera(42, stlStage.clientWidth / stlStage.clientHeight, radius / 1000, radius * 100);
        camera.position.set(radius * 1.8, radius * 1.5, radius * 2.4);
        const material = new THREE.MeshStandardMaterial({
            color: "#6b35a5",
            metalness: 0.16,
            roughness: 0.48
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        scene.add(new THREE.HemisphereLight("#ffffff", "#9584a6", 2));
        const keyLight = new THREE.DirectionalLight("#ffffff", 2.5);
        keyLight.position.set(radius * 2, radius * 3, radius * 4);
        scene.add(keyLight);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.minDistance = radius * 0.15;
        controls.maxDistance = radius * 20;
        controls.update();

        const resize = () => {
            const width = stlStage.clientWidth;
            const height = stlStage.clientHeight;
            if (width && height) {
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.render(scene, camera);
            }
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stlStage);
        controls.addEventListener("change", () => renderer.render(scene, camera));
        const renderFrame = () => {
            stlResources.frame = window.requestAnimationFrame(renderFrame);
            renderer.render(scene, camera);
        };

        stlResources = { frame: 0, controls, geometry, material, renderer, resizeObserver };
        renderFrame();
        const dimensionLabel = [dimensions.x, dimensions.y, dimensions.z]
            .map((dimension) => Number(dimension.toPrecision(4)))
            .join(" × ");
        if (Number.isFinite(stlVolumeCm3) && stlVolumeCm3 > 0) {
            stlWeightEstimator.hidden = false;
            updateStlWeightEstimate();
            setViewerStatus(`${file.name} is ready. Size: ${dimensionLabel} mm (STL units are assumed to be mm).`);
        } else {
            stlWeightEstimator.hidden = true;
            setViewerStatus(`${file.name} is ready. Weight estimate unavailable; check that the STL is a closed mesh and uses millimeters.`);
        }
    };

    const clearViewerContent = () => {
        clearStlViewer();
        stlVolumeCm3 = undefined;
        viewerFileInput.value = "";
        viewerStatus.textContent = "";
        viewerStatus.dataset.error = "false";
        viewerStatus.dataset.loading = "false";
        stlViewer.hidden = true;
        stlWeightEstimator.hidden = true;
        stlWeightResult.textContent = "";
        gerberViewer.hidden = true;
        gerberLayerList.replaceChildren();
        gerberStage.replaceChildren();
    };

    const openViewer = (type) => {
        clearViewerContent();
        activeViewer = type;
        const isStl = activeViewer === "stl";
        viewerTitle.textContent = isStl ? "Free STL 3D viewer" : "Free Gerber PCB viewer";
        viewerDescription.textContent = isStl
            ? "Open an STL model and rotate, zoom, or pan it in 3D."
            : "Open Gerber layer files or a ZIP archive to preview and toggle PCB layers.";
        viewerFileLabel.textContent = isStl ? "Choose an STL file" : "Choose Gerber files or a ZIP";
        viewerFileInput.accept = isStl ? ".stl,model/stl" : ".zip,.gbr,.ger,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gko,.gm1,.gm2,.gm3,.gm4,.g1,.g2,.g3,.g4,.drl,.xln";
        viewerFileInput.multiple = !isStl;
        if (!viewerDialog.open) {
            viewerDialog.showModal();
        }
    };

    viewerDialog.querySelector(".viewer-close").addEventListener("click", () => viewerDialog.close());
    stlMaterial.addEventListener("change", updateStlWeightEstimate);
    stlInfill.addEventListener("input", updateStlWeightEstimate);
    viewerDialog.addEventListener("close", () => {
        clearViewerContent();
        if (new URLSearchParams(window.location.search).has("viewer")) {
            window.location.replace("./");
        }
    });
    viewerDialog.addEventListener("click", (event) => {
        if (event.target === viewerDialog) {
            viewerDialog.close();
        }
    });

    const requestedViewer = new URLSearchParams(window.location.search).get("viewer");
    if (requestedViewer === "stl" || requestedViewer === "gerber") {
        document.body.classList.add("viewer-page-mode");
        openViewer(requestedViewer);
    }

    viewerFileInput.addEventListener("change", async () => {
        const files = [...viewerFileInput.files];
        if (files.length === 0) {
            return;
        }

        try {
            if (activeViewer === "stl") {
                stlViewer.hidden = false;
                setViewerStatus("Please wait while your STL model is being loaded...", false, true);
                await showStlFile(files[0]);
                return;
            }

            if (files.length > 30) {
                throw new Error("Please choose no more than 30 Gerber files at a time.");
            }

            const totalBytes = files.reduce((total, file) => total + file.size, 0);
            if (totalBytes > 50 * 1024 * 1024) {
                throw new Error("Please choose Gerber files with a combined size under 50 MB.");
            }

            setViewerStatus("Loading the Gerber viewer...");
            const gerberToSvg = await loadScript(
                "https://cdn.jsdelivr.net/npm/gerber-to-svg@4.2.8/dist/gerber-to-svg.min.js",
                "gerberToSvg"
            );
            const zipFile = files.find((file) => /\.zip$/i.test(file.name));
            let gerberFiles;

            if (zipFile) {
                if (files.length > 1) {
                    throw new Error("Choose either one ZIP archive or individual Gerber files, not both.");
                }
                const JSZip = await loadScript(
                    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
                    "JSZip"
                );
                const archive = await JSZip.loadAsync(zipFile);
                const entries = Object.values(archive.files).filter((entry) => !entry.dir && gerberExtensions.test(entry.name));
                if (entries.length > 30) {
                    throw new Error("This ZIP contains more than 30 Gerber files. Please choose a smaller set.");
                }
                gerberFiles = [];
                let expandedBytes = 0;
                for (const entry of entries) {
                    if (entry._data && entry._data.uncompressedSize > 10 * 1024 * 1024) {
                        throw new Error("A Gerber file in this ZIP exceeds the 10 MB per-file limit.");
                    }
                    const contents = await entry.async("string");
                    expandedBytes += contents.length;
                    if (contents.length > 10 * 1024 * 1024 || expandedBytes > 30 * 1024 * 1024) {
                        throw new Error("The uncompressed Gerber files exceed the 30 MB viewer limit.");
                    }
                    gerberFiles.push({ name: entry.name, contents });
                }
            } else {
                gerberFiles = files.filter((file) => gerberExtensions.test(file.name));
                if (gerberFiles.some((file) => file.size > 10 * 1024 * 1024)) {
                    throw new Error("Each Gerber file must be smaller than 10 MB.");
                }
                gerberFiles = gerberFiles.map((file) => ({ name: file.name, file }));
            }

            if (gerberFiles.length === 0) {
                throw new Error("No supported Gerber or drill files were found. Choose a ZIP or files such as .gtl, .gbl, or .drl.");
            }

            const layers = [];
            const failures = [];
            for (const [index, item] of gerberFiles.entries()) {
                setViewerStatus(`Reading Gerber layer ${index + 1} of ${gerberFiles.length}...`);
                try {
                    const contents = item.contents ?? await item.file.text();
                    layers.push(await readGerberFile(item.name, contents, index, gerberToSvg));
                } catch (error) {
                    failures.push(error.message);
                }
            }

            if (layers.length === 0) {
                throw new Error(failures.join(" "));
            }

            displayGerberLayers(layers);
            setViewerStatus(
                failures.length
                    ? `Rendered ${layers.length} of ${gerberFiles.length} layers. ${failures.join(" ")}`
                    : `Rendered ${layers.length} Gerber layers from your local files.`
            );
        } catch (error) {
            setViewerStatus(error.message || "The selected file could not be opened.", true);
        }
    });

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
