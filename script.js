class VideoScreenshotGenerator {
    constructor() {
        this.dom = {
            videoInput: document.getElementById('videoInput'),
            uploadArea: document.getElementById('uploadArea'),
            frameCount: document.getElementById('frameCount'),
            frameCountValue: document.getElementById('frameCountValue'),
            gridWidth: document.getElementById('gridWidth'),
            gridWidthValue: document.getElementById('gridWidthValue'),
            columns: document.getElementById('columns'),
            showTimestamps: document.getElementById('showTimestamps'),
            generateBtn: document.getElementById('generateBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            resetBtn: document.getElementById('resetBtn'),
            screenshotGrid: document.getElementById('screenshotGrid'),
            controlsSection: document.getElementById('controlsSection'),
            previewSection: document.getElementById('previewSection'),
            progressSection: document.getElementById('progressSection'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            videoInfo: document.getElementById('videoInfo')
        };

        this.video = document.getElementById('videoElement');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentVideoFile = null;
        this.currentVideoUrl = null;
        this.screenshots = [];
        this.captureWidth = 0;
        this.captureHeight = 0;
        this.lastProgressDisplayed = -1;
        this.MAX_CAPTURE_WIDTH = 1920;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Загрузка файла
        const videoInput = this.dom.videoInput;
        const uploadArea = this.dom.uploadArea;
        
        videoInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('video/')) {
                this.loadVideo(files[0]);
            }
        });
        
        // Контролы
        const frameCount = this.dom.frameCount;
        const frameCountValue = this.dom.frameCountValue;
        frameCount.addEventListener('input', () => {
            frameCountValue.textContent = frameCount.value;
        });
        
        const gridWidth = this.dom.gridWidth;
        const gridWidthValue = this.dom.gridWidthValue;
        gridWidth.addEventListener('input', () => {
            gridWidthValue.textContent = gridWidth.value + 'px';
            this.updateGridWidth(gridWidth.value);
        });
        
        const columns = this.dom.columns;
        columns.addEventListener('change', () => {
            this.dom.screenshotGrid.style.setProperty('--columns', columns.value);
        });
        
        this.dom.generateBtn.addEventListener('click', () => {
            this.generateScreenshots();
        });
        
        const downloadBtn = this.dom.downloadBtn;
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.downloadScreenshots();
            });
        }
        
        const resetBtn = this.dom.resetBtn;
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.reset();
            });
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('video/')) {
            this.loadVideo(file);
        } else {
            alert('Пожалуйста, выберите видео файл');
        }
    }

    loadVideo(file) {
        this.currentVideoFile = file;
        this.cleanupScreenshotResources();

        if (this.currentVideoUrl) {
            URL.revokeObjectURL(this.currentVideoUrl);
            this.currentVideoUrl = null;
        }

        this.currentVideoUrl = URL.createObjectURL(file);
        this.video.src = this.currentVideoUrl;

        this.video.addEventListener('loadedmetadata', () => {
            this.showVideoInfo();
            this.showControls();
        }, { once: true });
        
        this.video.addEventListener('error', () => {
            alert('Ошибка при загрузке видео. Убедитесь, что файл не поврежден.');
        }, { once: true });
    }

    showVideoInfo() {
        const videoInfo = this.dom.videoInfo;
        const duration = this.formatTime(this.video.duration);
        const fileSize = this.formatFileSize(this.currentVideoFile.size);
        
        videoInfo.innerHTML = `
            <h4>📹 Информация о видео</h4>
            <div class="video-info-item">
                <span>Название:</span>
                <strong>${this.currentVideoFile.name}</strong>
            </div>
            <div class="video-info-item">
                <span>Длительность:</span>
                <strong>${duration}</strong>
            </div>
            <div class="video-info-item">
                <span>Разрешение:</span>
                <strong>${this.video.videoWidth} × ${this.video.videoHeight}</strong>
            </div>
            <div class="video-info-item">
                <span>Размер файла:</span>
                <strong>${fileSize}</strong>
            </div>
        `;
    }

    showControls() {
        this.dom.controlsSection.style.display = 'block';
        this.dom.uploadArea.style.display = 'none';
    }

    async generateScreenshots() {
        const frameCount = parseInt(this.dom.frameCount.value);
        const showTimestamps = this.dom.showTimestamps.checked;
        const columns = parseInt(this.dom.columns.value);
        
        // Показать прогресс
        this.showProgress();
        
        this.cleanupScreenshotResources();
        const duration = this.video.duration;
        const interval = duration / (frameCount + 1);
        const progressStep = Math.max(1, Math.floor(frameCount / 20));
        const { width, height } = this.getCaptureDimensions(columns);
        this.captureWidth = width;
        this.captureHeight = height;
        
        // Настроить canvas
        this.canvas.width = this.captureWidth;
        this.canvas.height = this.captureHeight;
        
        for (let i = 1; i <= frameCount; i++) {
            const time = interval * i;
            
            try {
                const screenshotBlob = await this.captureFrame(time, showTimestamps);
                const screenshotUrl = URL.createObjectURL(screenshotBlob);
                this.screenshots.push({
                    blob: screenshotBlob,
                    url: screenshotUrl,
                    timestamp: time,
                    formattedTime: this.formatTime(time)
                });
                
                // Обновить прогресс
                if (i === frameCount || i % progressStep === 0) {
                    this.updateProgress((i / frameCount) * 100);
                    await this.yieldToMainThread();
                }
            } catch (error) {
                console.error('Ошибка при создании скриншота:', error);
            }
        }
        
        this.hideProgress();
        this.displayScreenshots(columns);
    }

    captureFrame(time, showTimestamps) {
        return new Promise((resolve, reject) => {
            const video = this.video;
            
            const onSeeked = () => {
                try {
                    // Очищаем canvas и рисуем видео
                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
                    
                    // Добавляем временную метку на скриншот, если включена опция
                    if (showTimestamps) {
                        const timestamp = this.formatTime(time);
                        
                        // Настройки для временной метки
                        const fontSize = Math.max(16, Math.floor(this.canvas.width / 14)); // Адаптивный размер шрифта
                        const padding = Math.floor(fontSize * 0.4);
                        
                        this.ctx.font = `bold ${fontSize}px Arial`;
                        
                        // Измеряем размер текста
                        const textMetrics = this.ctx.measureText(timestamp);
                        const textWidth = textMetrics.width;
                        const textHeight = fontSize;
                        
                        // Позиция: правый нижний угол с отступом
                        const x = this.canvas.width - textWidth - padding * 2;
                        const y = this.canvas.height - padding;

                        // Настраиваем тень для текста
                        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; // Черная тень с прозрачностью
                        this.ctx.shadowBlur = 4; // Размытие тени
                        this.ctx.shadowOffsetX = 4; // Смещение тени по X
                        this.ctx.shadowOffsetY = 4; // Смещение тени по Y

                        // Устанавливаем выравнивание текста
                        this.ctx.textAlign = 'left';
                        this.ctx.textBaseline = 'top';

                        // Рисуем черную обводку текста
                        this.ctx.strokeStyle = '#000000'; // Черный цвет обводки
                        this.ctx.lineWidth = 8; // Толщина обводки
                        this.ctx.lineJoin = 'round'; // Скругленные углы обводки
                        this.ctx.strokeText(timestamp, x, y - textHeight);

                        // Рисуем полупрозрачный текст временной метки поверх обводки
                        this.ctx.fillStyle = 'rgba(220, 220, 220, 0.6)';
                        this.ctx.fillText(timestamp, x, y - textHeight);

                        // Сбрасываем настройки тени и обводки для следующих операций рисования
                        this.ctx.shadowColor = 'transparent';
                        this.ctx.shadowBlur = 0;
                        this.ctx.shadowOffsetX = 0;
                        this.ctx.shadowOffsetY = 0;
                        this.ctx.lineWidth = 1;
                    }
                    
                    this.canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Не удалось создать blob изображения'));
                            return;
                        }
                        resolve(blob);
                    }, 'image/jpeg', 0.8);
                } catch (error) {
                    reject(error);
                }
            };
            
            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = time;
        });
    }

    displayScreenshots(columns) {
        const grid = this.dom.screenshotGrid;
        const fragment = document.createDocumentFragment();
        
        grid.style.setProperty('--columns', columns);
        grid.textContent = '';
        
        this.screenshots.forEach((screenshot, index) => {
            const item = document.createElement('div');
            item.className = 'screenshot-item';
            
            const img = document.createElement('img');
            img.src = screenshot.url;
            img.alt = `Кадр ${index + 1}`;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.width = this.captureWidth;
            img.height = this.captureHeight;
            
            item.appendChild(img);
            fragment.appendChild(item);
        });

        grid.appendChild(fragment);
        
        this.dom.previewSection.style.display = 'block';
    }

    updateGridWidth(width) {
        // Для предварительного просмотра не ограничиваем ширину
        // Размер скриншотов будет определяться CSS
    }

    async downloadScreenshots() {
        if (this.screenshots.length === 0) {
            alert('Сначала создайте скринлист');
            return;
        }
        
        const columns = parseInt(this.dom.columns.value);
        const gridWidth = parseInt(this.dom.gridWidth.value);
        
        // Создать большой canvas для всех скриншотов
        const downloadCanvas = document.createElement('canvas');
        const downloadCtx = downloadCanvas.getContext('2d');
        
        // Расчет размеров canvas (убираем высоту для временных меток)
        const rows = Math.ceil(this.screenshots.length / columns);
        const padding = 10;
        const gap = 2;
        const headerHeight = 55; // Высота заголовка
        
        // Ширина canvas точно соответствует заданной ширине скринлиста
        downloadCanvas.width = gridWidth;
        
        // Автоматический расчет размеров скриншотов
        const availableWidth = gridWidth - 2 * padding - (columns - 1) * gap;
        const screenshotWidth = availableWidth / columns;
        const screenshotHeight = Math.round((screenshotWidth / this.video.videoWidth) * this.video.videoHeight);
        const itemHeight = screenshotHeight; // Убираем высоту для временных меток
        
        // Высота canvas с равномерными отступами со всех сторон
        downloadCanvas.height = headerHeight + padding + rows * itemHeight + (rows - 1) * gap + padding;
        
        // Фон
        downloadCtx.fillStyle = '#ffffff';
        downloadCtx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);
        
        // Минималистичный заголовок
        downloadCtx.fillStyle = '#333';
        downloadCtx.font = 'bold 14px Arial';
        downloadCtx.textAlign = 'left';
        downloadCtx.fillText(
            `${this.currentVideoFile.name}`,
            10,
            20
        );
        
        downloadCtx.font = '12px Arial';
        downloadCtx.fillStyle = '#666';
        const fileSize = this.formatFileSize(this.currentVideoFile.size);
        downloadCtx.fillText(
            `${this.formatTime(this.video.duration)} | ${this.video.videoWidth}×${this.video.videoHeight} | ${fileSize} | ${this.screenshots.length} кадров`,
            10,
            35
        );
        
        // Дополнительная информация о скриншотах
        downloadCtx.font = '12px Arial';
        downloadCtx.fillStyle = '#888';
        downloadCtx.fillText(
            `Размер скриншота: ${Math.round(screenshotWidth)}×${Math.round(screenshotHeight)}px | Сетка: ${columns} колонки`,
            10,
            48
        );
        
        // Отрисовка скриншотов
        for (let i = 0; i < this.screenshots.length; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            
            const x = padding + col * (screenshotWidth + gap);
            const y = headerHeight + padding + row * (itemHeight + gap);
            
            await this.drawBlobToCanvas(
                downloadCtx,
                this.screenshots[i].blob,
                x,
                y,
                screenshotWidth,
                screenshotHeight
            );
        }
        
        // Скачать
        downloadCanvas.toBlob((blob) => {
            if (!blob) {
                alert('Не удалось сформировать файл для скачивания');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `screenlist_${this.currentVideoFile.name.replace(/\.[^/.]+$/, '')}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/jpeg', 0.9);
    }

    showProgress() {
        this.lastProgressDisplayed = -1;
        this.dom.progressSection.style.display = 'block';
        this.dom.generateBtn.disabled = true;
        this.updateProgress(0);
    }

    updateProgress(percent) {
        const roundedPercent = Math.round(percent);
        if (roundedPercent === this.lastProgressDisplayed) {
            return;
        }

        this.lastProgressDisplayed = roundedPercent;
        this.dom.progressFill.style.width = `${roundedPercent}%`;
        this.dom.progressText.textContent = `Обработка видео... ${roundedPercent}%`;
    }

    hideProgress() {
        this.dom.progressSection.style.display = 'none';
        this.dom.generateBtn.disabled = false;
    }

    reset() {
        try {
            // Скрыть все секции кроме загрузки
            if (this.dom.controlsSection) this.dom.controlsSection.style.display = 'none';
            if (this.dom.previewSection) this.dom.previewSection.style.display = 'none';
            if (this.dom.progressSection) this.dom.progressSection.style.display = 'none';
            if (this.dom.uploadArea) this.dom.uploadArea.style.display = 'block';
            if (this.dom.screenshotGrid) this.dom.screenshotGrid.textContent = '';
            
            // Очистить данные
            this.currentVideoFile = null;
            this.cleanupScreenshotResources();
            
            if (this.dom.videoInput) this.dom.videoInput.value = '';
            
            // Освободить память
            if (this.currentVideoUrl) {
                URL.revokeObjectURL(this.currentVideoUrl);
                this.currentVideoUrl = null;
            }

            if (this.video && this.video.src && this.video.src.startsWith('blob:')) {
                this.video.src = '';
            }
            
            // Сбросить видео элемент
            if (this.video) {
                this.video.removeAttribute('src');
                this.video.load();
            }
        } catch (error) {
            console.error('Ошибка при сбросе:', error);
            // Принудительно показать область загрузки даже при ошибке
            if (this.dom.uploadArea) this.dom.uploadArea.style.display = 'block';
        }
    }

    cleanupScreenshotResources() {
        for (const screenshot of this.screenshots) {
            if (screenshot.url && screenshot.url.startsWith('blob:')) {
                URL.revokeObjectURL(screenshot.url);
            }
        }
        this.screenshots = [];
    }

    getCaptureDimensions(columns) {
        const gridWidth = parseInt(this.dom.gridWidth.value);
        const padding = 10;
        const gap = 2;
        const previewWidth = 400;
        const availableWidth = gridWidth - 2 * padding - (columns - 1) * gap;
        const exportWidth = Math.max(1, Math.ceil(availableWidth / columns));
        const baseWidth = Math.max(previewWidth, exportWidth);
        const width = Math.max(
            1,
            Math.min(this.video.videoWidth, this.MAX_CAPTURE_WIDTH, baseWidth)
        );
        const height = Math.max(
            1,
            Math.round((width / this.video.videoWidth) * this.video.videoHeight)
        );
        return { width, height };
    }

    async drawBlobToCanvas(ctx, blob, x, y, width, height) {
        if ('createImageBitmap' in window) {
            const imageBitmap = await createImageBitmap(blob);
            ctx.drawImage(imageBitmap, x, y, width, height);
            imageBitmap.close();
            return;
        }

        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
        ctx.drawImage(img, x, y, width, height);
        URL.revokeObjectURL(img.src);
    }

    yieldToMainThread() {
        return new Promise((resolve) => requestAnimationFrame(resolve));
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatFileSize(bytes) {
        const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        if (bytes === 0) return '0 Б';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new VideoScreenshotGenerator();
});

// Предотвращение drag & drop на странице
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());