(() => {
  "use strict";

  if (window.__LI_FAMILY_PHOTO_LIGHTBOX_V1__) return;
  window.__LI_FAMILY_PHOTO_LIGHTBOX_V1__ = true;

  const archive = document.querySelector("[data-photo-archive]");
  const dialog = archive?.querySelector("[data-photo-lightbox]");
  const items = archive ? [...archive.querySelectorAll("[data-photo-lightbox-item]")] : [];
  if (!archive || !dialog || !items.length || typeof dialog.showModal !== "function") return;

  const image = dialog.querySelector("[data-photo-lightbox-image]");
  const caption = dialog.querySelector("[data-photo-lightbox-caption]");
  const count = dialog.querySelector("[data-photo-lightbox-count]");
  const closeButton = dialog.querySelector("[data-photo-lightbox-close]");
  const previousButton = dialog.querySelector("[data-photo-lightbox-previous]");
  const nextButton = dialog.querySelector("[data-photo-lightbox-next]");
  const fallback = dialog.querySelector("[data-photo-lightbox-fallback]");
  const originalLink = dialog.querySelector("[data-photo-lightbox-original]");
  if (
    !image ||
    !caption ||
    !count ||
    !closeButton ||
    !previousButton ||
    !nextButton ||
    !fallback ||
    !originalLink
  ) {
    return;
  }

  let activeIndex = 0;
  let opener = null;
  let loadToken = 0;

  function photoAt(index) {
    const normalizedIndex = (index + items.length) % items.length;
    const item = items[normalizedIndex];
    return {
      index: normalizedIndex,
      item,
      src: item.dataset.photoSrc,
      alt: item.dataset.photoAlt,
      caption: item.dataset.photoCaption,
      width: item.dataset.photoWidth,
      height: item.dataset.photoHeight,
    };
  }

  function preloadAdjacent(index) {
    for (const adjacentIndex of [index - 1, index + 1]) {
      const photo = photoAt(adjacentIndex);
      const preload = new Image();
      preload.src = photo.src;
    }
  }

  function showPhoto(index) {
    const photo = photoAt(index);
    const currentLoadToken = ++loadToken;
    activeIndex = photo.index;
    fallback.hidden = true;
    image.removeAttribute("src");
    image.alt = photo.alt;
    image.width = Number(photo.width);
    image.height = Number(photo.height);
    caption.textContent = photo.caption;
    count.textContent = `第${photo.index + 1}张，共${items.length}张`;
    originalLink.href = photo.src;
    image.onload = () => {
      if (currentLoadToken === loadToken) fallback.hidden = true;
    };
    image.onerror = () => {
      if (currentLoadToken === loadToken) fallback.hidden = false;
    };
    image.src = photo.src;
    preloadAdjacent(photo.index);
  }

  function openPhoto(index, trigger) {
    opener = trigger;
    showPhoto(index);
    document.documentElement.classList.add("photo-lightbox-open");
    dialog.showModal();
    closeButton.focus();
  }

  function closePhoto() {
    if (dialog.open) dialog.close();
  }

  for (const [index, item] of items.entries()) {
    item.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      openPhoto(index, item);
    });
  }

  closeButton.addEventListener("click", closePhoto);
  previousButton.addEventListener("click", () => showPhoto(activeIndex - 1));
  nextButton.addEventListener("click", () => showPhoto(activeIndex + 1));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closePhoto();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    document.documentElement.classList.remove("photo-lightbox-open");
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("photo-lightbox-open");
    image.removeAttribute("src");
    image.onload = null;
    image.onerror = null;
    if (opener?.isConnected) opener.focus();
    opener = null;
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPhoto(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(activeIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      showPhoto(0);
    } else if (event.key === "End") {
      event.preventDefault();
      showPhoto(items.length - 1);
    }
  });
})();
