// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('SW registered:', registration);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    });
}

// Online/Offline detection
window.addEventListener('online', () => {
    document.getElementById('offlineIndicator').classList.remove('show');
    showToast('Подключение восстановлено');
});

window.addEventListener('offline', () => {
    document.getElementById('offlineIndicator').classList.add('show');
    showToast('Работа в офлайн-режиме');
});

// Инициализация данных
let rooms = JSON.parse(localStorage.getItem('hostel_rooms')) || [];
let bookings = JSON.parse(localStorage.getItem('hostel_bookings')) || [];
let history = JSON.parse(localStorage.getItem('hostel_history')) || [];
let settings = JSON.parse(localStorage.getItem('hostel_settings')) || {
    // Эти значения используются только как общие настройки
    // и для создания новой конфигурации через модальное окно.
    roomCount: 11,
    bedsPerRoom: 6,
    defaultPrice: 750
};

let currentRoom = null;
let currentBed = null;
let currentFilter = 'all';

// Инициализация
if (rooms.length === 0) {
    const hasExistingRooms = !!localStorage.getItem('hostel_rooms');
    if (!hasExistingRooms) {
        // Первичный запуск: создаём преднастроенную схему комнат
        initRoomsWithDefaultLayout();
    } else {
        initRooms();
    }
} else {
    if (!settings.defaultPrice || settings.defaultPrice === 1500) {
        settings.defaultPrice = 750;
    }
}

function initRoomsWithDefaultLayout() {
    // Предустановленная планировка:
    // 1:6, 2:6, 3:6, 4:4, 5:8, 6:10, 7:6, 8:10, 9:8, 10:8, 11:4
    const roomBedConfig = [6, 6, 6, 4, 8, 10, 6, 10, 8, 8, 4];
    rooms = [];

    roomBedConfig.forEach((bedsCount, index) => {
        const roomId = index + 1;
        const beds = [];
        for (let j = 1; j <= bedsCount; j++) {
            beds.push({
                id: j,
                occupied: false,
                booking: null
            });
        }
        rooms.push({
            id: roomId,
            number: roomId,
            beds,
            price: settings.defaultPrice
        });
    });

    // Обновляем настройки, чтобы они соответствовали текущему количеству комнат
    settings.roomCount = rooms.length;
    saveData();
}

function initRooms() {
    rooms = [];
    for (let i = 1; i <= settings.roomCount; i++) {
        let beds = [];
        for (let j = 1; j <= settings.bedsPerRoom; j++) {
            beds.push({
                id: j,
                occupied: false,
                booking: null
            });
        }
        rooms.push({
            id: i,
            number: i,
            beds: beds,
            price: settings.defaultPrice
        });
    }
    saveData();
}

function saveData() {
    localStorage.setItem('hostel_rooms', JSON.stringify(rooms));
    localStorage.setItem('hostel_bookings', JSON.stringify(bookings));
    localStorage.setItem('hostel_history', JSON.stringify(history));
    localStorage.setItem('hostel_settings', JSON.stringify(settings));
    updateStats();
    renderRooms();
    renderGuests();
    renderHistory();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function updateStats() {
    let totalBeds = 0;
    let occupiedBeds = 0;

    rooms.forEach(room => {
        totalBeds += room.beds.length;
        occupiedBeds += room.beds.filter(b => b.occupied).length;
    });

    const freeBeds = totalBeds - occupiedBeds;

    document.getElementById('totalBeds').textContent = totalBeds;
    document.getElementById('freeBeds').textContent = freeBeds;
    document.getElementById('occupiedBeds').textContent = occupiedBeds;

    const occupancy = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    document.getElementById('occupancyRate').textContent = occupancy + '%';

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = history
        .filter(h => new Date(h.checkIn) >= monthStart)
        .reduce((sum, h) => sum + (h.totalPrice || 0), 0);
    document.getElementById('monthRevenue').textContent = monthRevenue.toLocaleString() + '₽';
}

function renderRooms() {
    const container = document.getElementById('roomsList');
    container.innerHTML = '';

    rooms.forEach(room => {
        const occupiedCount = room.beds.filter(b => b.occupied).length;

        const card = document.createElement('div');
        card.className = 'room-card';

        let bedsHtml = '<div class="beds-grid">';
        room.beds.forEach(bed => {
            const guest = bed.booking ? bed.booking.guestName.split(' ')[0] : '';
            bedsHtml += `
                <div class="bed ${bed.occupied ? 'occupied' : 'available'}" onclick="openBedModal(${room.id}, ${bed.id})">
                    <div class="bed-icon">${bed.occupied ? '😴' : '🛏'}</div>
                    <div class="bed-number">${bed.id}</div>
                    ${bed.occupied ? `<div class="bed-guest">${guest}</div>` : ''}
                </div>
            `;
        });
        bedsHtml += '</div>';

        const lastBed = room.beds[room.beds.length - 1];
        const canRemoveBed = room.beds.length > 1 && !lastBed.occupied;

        card.innerHTML = `
            <div class="room-header">
                <div class="room-number">Комната ${room.number}</div>
                <div class="room-price">${room.price}₽</div>
            </div>
            ${bedsHtml}
            <div class="room-controls">
                <button class="room-btn add" onclick="addBedToRoom(${room.id})">+ Добавить кровать</button>
                <button class="room-btn remove" onclick="removeBedFromRoom(${room.id})" ${!canRemoveBed ? 'disabled' : ''}>- Убрать кровать</button>
            </div>
            <div class="room-status-bar">
                <span class="${occupiedCount === room.beds.length ? 'status-occupied' : 'status-free'}">
                    ${occupiedCount}/${room.beds.length} занято
                </span>
                <span style="color:#333;">
                    ${room.beds.length} кроватей
                </span>
            </div>
        `;

        container.appendChild(card);
    });
}

function addBedToRoom(roomId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const newBedId = room.beds.length > 0 ? Math.max(...room.beds.map(b => b.id)) + 1 : 1;
    room.beds.push({
        id: newBedId,
        occupied: false,
        booking: null
    });

    saveData();
    showToast(`Кровать добавлена в комнату ${room.number}`);

    if (navigator.vibrate) navigator.vibrate(50);
}

function removeBedFromRoom(roomId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.beds.length <= 1) return;

    const lastBed = room.beds[room.beds.length - 1];
    if (lastBed.occupied) {
        showToast('Нельзя удалить занятую кровать');
        return;
    }

    if (confirm(`Удалить последнюю кровать из комнаты ${room.number}?`)) {
        room.beds.pop();
        saveData();
        showToast('Кровать удалена');
    }
}

function openBedModal(roomId, bedId) {
    currentRoom = rooms.find(r => r.id === roomId);
    currentBed = currentRoom.beds.find(b => b.id === bedId);

    document.getElementById('modalRoomNum').textContent = currentRoom.number;
    document.getElementById('modalBedNum').textContent = currentBed.id;
    document.getElementById('bedModal').classList.add('active');

    const form = document.getElementById('bookingForm');
    const saveBtn = document.getElementById('saveBtn');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const bedDetail = document.getElementById('bedDetail');
    const bedStatusText = document.getElementById('bedStatusText');

    if (currentBed.occupied && currentBed.booking) {
        document.getElementById('guestName').value = currentBed.booking.guestName;
        document.getElementById('guestPhone').value = currentBed.booking.phone || '';
        document.getElementById('bedPrice').value = currentBed.booking.pricePerNight;
        document.getElementById('checkIn').value = currentBed.booking.checkIn;
        document.getElementById('checkOut').value = currentBed.booking.checkOut;
        document.getElementById('guestNotes').value = currentBed.booking.notes || '';

        saveBtn.style.display = 'none';
        checkoutBtn.style.display = 'block';
        cancelBtn.style.display = 'block';

        bedDetail.className = 'bed-detail occupied';
        bedStatusText.textContent = 'Занято';
        bedStatusText.className = 'bed-detail-status occupied';
    } else {
        form.reset();
        document.getElementById('bedPrice').value = currentRoom.price;
        document.getElementById('checkIn').value = new Date().toISOString().split('T')[0];

        saveBtn.style.display = 'block';
        checkoutBtn.style.display = 'none';
        cancelBtn.style.display = 'none';

        bedDetail.className = 'bed-detail available';
        bedStatusText.textContent = 'Свободно';
        bedStatusText.className = 'bed-detail-status free';
    }
}

function closeModal() {
    document.getElementById('bedModal').classList.remove('active');
    currentRoom = null;
    currentBed = null;
}

function saveBooking(e) {
    e.preventDefault();

    const booking = {
        id: Date.now(),
        roomId: currentRoom.id,
        roomNumber: currentRoom.number,
        bedId: currentBed.id,
        guestName: document.getElementById('guestName').value,
        phone: document.getElementById('guestPhone').value,
        pricePerNight: parseInt(document.getElementById('bedPrice').value),
        checkIn: document.getElementById('checkIn').value,
        checkOut: document.getElementById('checkOut').value,
        notes: document.getElementById('guestNotes').value,
        checkedOut: false,
        createdAt: new Date().toISOString()
    };

    const roomIndex = rooms.findIndex(r => r.id === currentRoom.id);
    const bedIndex = rooms[roomIndex].beds.findIndex(b => b.id === currentBed.id);
    rooms[roomIndex].beds[bedIndex].occupied = true;
    rooms[roomIndex].beds[bedIndex].booking = booking;
    rooms[roomIndex].price = booking.pricePerNight;

    bookings.push(booking);

    saveData();
    closeModal();
    showToast('Гость заселён');

    if (navigator.vibrate) navigator.vibrate(50);
}

function checkout() {
    if (!currentBed || !currentBed.booking) return;

    const booking = currentBed.booking;
    const nights = Math.max(1, Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24)));
    const totalPrice = nights * booking.pricePerNight;

    if (!confirm(`Выселить гостя?\n\n${booking.guestName}\n${nights} ночей × ${booking.pricePerNight}₽ = ${totalPrice}₽`)) {
        return;
    }

    history.unshift({
        ...booking,
        checkedOut: true,
        actualCheckOut: new Date().toISOString(),
        totalPrice: totalPrice,
        nights: nights
    });

    bookings = bookings.filter(b => b.id !== booking.id);

    const roomIndex = rooms.findIndex(r => r.id === currentRoom.id);
    const bedIndex = rooms[roomIndex].beds.findIndex(b => b.id === currentBed.id);
    rooms[roomIndex].beds[bedIndex].occupied = false;
    rooms[roomIndex].beds[bedIndex].booking = null;

    saveData();
    closeModal();
    showToast(`Выселено. Сумма: ${totalPrice}₽`);

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

function cancelBooking() {
    if (!confirm('Отменить бронирование?')) return;

    const booking = currentBed.booking;
    bookings = bookings.filter(b => b.id !== booking.id);

    const roomIndex = rooms.findIndex(r => r.id === currentRoom.id);
    const bedIndex = rooms[roomIndex].beds.findIndex(b => b.id === currentBed.id);
    rooms[roomIndex].beds[bedIndex].occupied = false;
    rooms[roomIndex].beds[bedIndex].booking = null;

    saveData();
    closeModal();
    showToast('Бронь отменена');
}

function renderGuests() {
    const list = document.getElementById('guestList');
    let filteredBookings = bookings.filter(b => !b.checkedOut);

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    if (currentFilter === 'today') {
        filteredBookings = filteredBookings.filter(b => b.checkIn === today);
    } else if (currentFilter === 'tomorrow') {
        filteredBookings = filteredBookings.filter(b => b.checkOut === tomorrow);
    }

    if (filteredBookings.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🛏</div>
                <div>Нет гостей</div>
            </div>
        `;
        return;
    }

    filteredBookings.sort((a, b) => new Date(a.checkOut) - new Date(b.checkOut));

    list.innerHTML = filteredBookings.map(b => {
        const isLeavingToday = b.checkOut === today;
        const isLeavingTomorrow = b.checkOut === tomorrow;
        const nights = Math.ceil((new Date(b.checkOut) - new Date(b.checkIn)) / (1000 * 60 * 60 * 24));

        return `
            <div class="guest-item" style="${isLeavingToday ? 'border-color:#ff4444;' : ''}">
                <div class="guest-info">
                    <h4>${b.guestName}</h4>
                    <div class="details">
                        <span>Комната ${b.roomNumber}</span>
                        <span class="bed-badge">Кровать ${b.bedId}</span>
                        <span>${nights} ночей</span>
                        ${isLeavingToday ? '<span style="color:#ff4444;">Выезд сегодня</span>' : ''}
                        ${isLeavingTomorrow ? '<span style="color:#ffaa00;">Выезд завтра</span>' : ''}
                    </div>
                </div>
                <div class="guest-actions">
                    ${b.phone ? `<button class="icon-btn" onclick="callGuest('${b.phone}')">📞</button>` : ''}
                    <button class="icon-btn" onclick="openBedModal(${b.roomId}, ${b.bedId})">✎</button>
                </div>
            </div>
        `;
    }).join('');
}

function filterGuests(filter, button) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (button) {
        button.classList.add('active');
    }
    renderGuests();
}

function renderHistory() {
    const list = document.getElementById('historyList');

    if (history.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div>История пуста</div>
            </div>
        `;
        return;
    }

    list.innerHTML = history.slice(0, 30).map(h => `
        <div class="guest-item" style="opacity:0.7;">
            <div class="guest-info">
                <h4 style="text-decoration:line-through; color:#666;">${h.guestName}</h4>
                <div class="details">
                    <span>Комната ${h.roomNumber}, Кровать ${h.bedId}</span>
                    <span>${new Date(h.checkIn).toLocaleDateString()} - ${new Date(h.actualCheckOut || h.checkOut).toLocaleDateString()}</span>
                </div>
            </div>
            <div style="color:#00ff88; font-size:14px; font-weight:500;">
                +${h.totalPrice}₽
            </div>
        </div>
    `).join('');
}

function callGuest(phone) {
    if (phone) {
        window.location.href = `tel:${phone}`;
    }
}

function switchTab(tabName, tabElement) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    if (tabElement) {
        tabElement.classList.add('active');
    }
    document.getElementById(tabName).classList.add('active');
}

function openSettings() {
    document.getElementById('settingsRoomCount').value = settings.roomCount;
    document.getElementById('settingsBedCount').value = settings.bedsPerRoom;
    document.getElementById('settingsDefaultPrice').value = settings.defaultPrice;
    document.getElementById('settingsModal').classList.add('active');
    updateStats();
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings() {
    const newRoomCount = parseInt(document.getElementById('settingsRoomCount').value);
    const newBedCount = parseInt(document.getElementById('settingsBedCount').value);
    const newPrice = parseInt(document.getElementById('settingsDefaultPrice').value);

    if (newRoomCount !== settings.roomCount || newBedCount !== settings.bedsPerRoom) {
        if (!confirm('Изменение количества комнат или кроватей сбросит все текущие бронирования. Продолжить?')) {
            return;
        }
        settings.roomCount = newRoomCount;
        settings.bedsPerRoom = newBedCount;
        settings.defaultPrice = newPrice;
        initRooms();
    } else {
        settings.defaultPrice = newPrice;
        rooms.forEach(r => r.price = newPrice);
        saveData();
    }

    closeSettings();
    showToast('Настройки сохранены');
}

async function exportToDocx() {
    try {
        if (typeof docx === 'undefined' || !docx) {
            showToast('Библиотека DOCX не загружена. Проверьте подключение к интернету.');
            return;
        }
        if (typeof saveAs === 'undefined') {
            showToast('Библиотека сохранения файлов не загружена. Проверьте подключение к интернету.');
            return;
        }

        const { Document, Paragraph, Table, TableCell, TableRow, TextRun, AlignmentType, Packer } = docx;

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: "ОТЧЕТ ХОСТЕЛА",
                        heading: "Heading1",
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({ text: `Дата формирования: `, bold: true }),
                            new TextRun(new Date().toLocaleDateString('ru-RU'))
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({ text: `Текущая загрузка: `, bold: true }),
                            new TextRun(`${document.getElementById('occupancyRate').textContent} (${document.getElementById('occupiedBeds').textContent}/${document.getElementById('totalBeds').textContent} мест)`)
                        ],
                        spacing: { after: 400 }
                    }),

                    new Paragraph({
                        text: "АКТИВНЫЕ ГОСТИ",
                        heading: "Heading2",
                        spacing: { before: 400, after: 200 }
                    })
                ]
            }]
        });

        if (bookings.filter(b => !b.checkedOut).length > 0) {
            const activeGuestsRows = [
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: "Комната", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Кровать", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Гость", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Телефон", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Заезд", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Выезд", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Сумма", bold: true })] })
                    ]
                })
            ];

            bookings.filter(b => !b.checkedOut).forEach(b => {
                const nights = Math.ceil((new Date(b.checkOut) - new Date(b.checkIn)) / (1000 * 60 * 60 * 24));
                const total = nights * b.pricePerNight;

                activeGuestsRows.push(new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph(b.roomNumber.toString())] }),
                        new TableCell({ children: [new Paragraph(b.bedId.toString())] }),
                        new TableCell({ children: [new Paragraph(b.guestName)] }),
                        new TableCell({ children: [new Paragraph(b.phone || '-')] }),
                        new TableCell({ children: [new Paragraph(new Date(b.checkIn).toLocaleDateString('ru-RU'))] }),
                        new TableCell({ children: [new Paragraph(new Date(b.checkOut).toLocaleDateString('ru-RU'))] }),
                        new TableCell({ children: [new Paragraph(`${total} ₽`)] })
                    ]
                }));
            });

            doc.addSection({
                children: [
                    new Table({
                        rows: activeGuestsRows,
                        width: { size: 100, type: "pct" }
                    })
                ]
            });
        } else {
            doc.addSection({
                children: [new Paragraph({ text: "Нет активных гостей", italics: true })]
            });
        }

        doc.addSection({
            children: [
                new Paragraph({
                    text: "ИСТОРИЯ ЗАСЕЛЕНИЙ",
                    heading: "Heading2",
                    spacing: { before: 400, after: 200 }
                })
            ]
        });

        if (history.length > 0) {
            const historyRows = [
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: "Дата", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Гость", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Комната/Кровать", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Ночей", bold: true })] }),
                        new TableCell({ children: [new Paragraph({ text: "Выручка", bold: true })] })
                    ]
                })
            ];

            history.slice(0, 50).forEach(h => {
                historyRows.push(new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph(new Date(h.checkIn).toLocaleDateString('ru-RU'))] }),
                        new TableCell({ children: [new Paragraph(h.guestName)] }),
                        new TableCell({ children: [new Paragraph(`${h.roomNumber}/${h.bedId}`)] }),
                        new TableCell({ children: [new Paragraph(h.nights.toString())] }),
                        new TableCell({ children: [new Paragraph(`${h.totalPrice} ₽`)] })
                    ]
                }));
            });

            doc.addSection({
                children: [
                    new Table({
                        rows: historyRows,
                        width: { size: 100, type: "pct" }
                    })
                ]
            });
        }

        doc.addSection({
            children: [
                new Paragraph({
                    text: "СТАТУС КОМНАТ",
                    heading: "Heading2",
                    spacing: { before: 400, after: 200 }
                })
            ]
        });

        const roomRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: "Комната", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Всего кроватей", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Занято", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Свободно", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Загрузка", bold: true })] })
                ]
            })
        ];

        rooms.forEach(r => {
            const occupied = r.beds.filter(b => b.occupied).length;
            const free = r.beds.length - occupied;
            const percent = r.beds.length > 0 ? Math.round((occupied / r.beds.length) * 100) : 0;

            roomRows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph(r.number.toString())] }),
                    new TableCell({ children: [new Paragraph(r.beds.length.toString())] }),
                    new TableCell({ children: [new Paragraph(occupied.toString())] }),
                    new TableCell({ children: [new Paragraph(free.toString())] }),
                    new TableCell({ children: [new Paragraph(`${percent}%`)] })
                ]
            }));
        });

        doc.addSection({
            children: [
                new Table({
                    rows: roomRows,
                    width: { size: 100, type: "pct" }
                }),
                new Paragraph({ spacing: { before: 400 } }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Итого выручка (вся история): ", bold: true }),
                        new TextRun(`${history.reduce((sum, h) => sum + (h.totalPrice || 0), 0).toLocaleString()} ₽`)
                    ]
                })
            ]
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, `Hostel_Report_${new Date().toISOString().split('T')[0]}.docx`);

        showToast('Отчет Word сохранен');
        closeSettings();
    } catch (error) {
        console.error(error);
        alert('Ошибка экспорта: ' + (error && error.message ? error.message : error));
    }
}

function exportData() {
    const data = {
        rooms,
        bookings,
        history,
        settings,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hostel_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('JSON backup сохранен');
}

function clearAllData() {
    if (confirm('ВНИМАНИЕ: Все данные будут удалены безвозвратно! Это действие нельзя отменить.')) {
        localStorage.removeItem('hostel_rooms');
        localStorage.removeItem('hostel_bookings');
        localStorage.removeItem('hostel_history');
        localStorage.removeItem('hostel_settings');
        location.reload();
    }
}

window.onclick = function (e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
};

// Первичная инициализация UI
updateStats();
renderRooms();
renderGuests();
renderHistory();

