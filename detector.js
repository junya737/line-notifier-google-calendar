class GoogleCalendarDetector {
  constructor(calendarId, spreadsheetId) {
    this.calendarId = calendarId;
    this.spreadsheetId = spreadsheetId;
    this.calendarName = CalendarApp.getCalendarById(this.calendarId).getName(); // カレンダー名を取得
  }

  // 📌 日時を "YYYY/MM/DD HH:mm" または "YYYY/MM/DD"（終日イベント用）にフォーマット
  formatDateTime(date, isAllDay) {
    let d = new Date(date);
    let year = d.getFullYear();
    let month = ("0" + (d.getMonth() + 1)).slice(-2);
    let day = ("0" + d.getDate()).slice(-2);
    if (isAllDay) {
      return `${year}/${month}/${day}`; // 終日イベントは時間なし
    }
    let hours = ("0" + d.getHours()).slice(-2);
    let minutes = ("0" + d.getMinutes()).slice(-2);
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  }

  // 📌 Googleカレンダーのイベントを取得
  getEvents() {
    const calendar = CalendarApp.getCalendarById(this.calendarId);
    const now = new Date();
    const future = new Date(now.getTime() + CHECK_DAY_WINDOW * 24 * 60 * 60 * 1000);
    return calendar.getEvents(now, future);
  }

    // 📌 カレンダーの変更を検出（終日イベントの処理を修正）
  detectChanges(events) {
    const sheet = SpreadsheetApp.openById(this.spreadsheetId).getActiveSheet();
    const oldData = sheet.getDataRange().getValues();
    let oldEventMap = {};

    // スプレッドシートの過去データをマップ化（Date → フォーマット統一）
    for (let i = 1; i < oldData.length; i++) {
      let oldEventId = oldData[i][0] || "";
      let oldTitle = oldData[i][1] || "";
      let isAllDay = oldData[i][5] === "終日"; // 終日イベントかどうか
      let oldStartTime = oldData[i][2] ? this.formatDateTime(new Date(oldData[i][2]), isAllDay) : "";
      let oldEndTime = oldData[i][3] ? this.formatDateTime(new Date(oldData[i][3]), isAllDay) : "";
      let oldLocation = oldData[i][4] || "なし";

      oldEventMap[oldEventId] = { 
        title: oldTitle, 
        startTime: oldStartTime, 
        endTime: oldEndTime, 
        location: oldLocation, 
        isAllDay: isAllDay 
      };
    }

    let newEventData = [];
    let newEvents = [];
    let changedEvents = [];
    let deletedEvents = [];

    // 現在のイベントと過去データを比較
    events.forEach(event => {
      let eventId = event.getId();
      let eventTitle = event.getTitle();
      let isAllDay = event.isAllDayEvent(); // 終日イベントの判定
      let startTime = this.formatDateTime(event.getStartTime(), isAllDay);
      let endTime = this.formatDateTime(event.getEndTime(), isAllDay);
      let location = event.getLocation() || "なし";

      newEventData.push([eventId, eventTitle, startTime, endTime, location, isAllDay ? "終日" : "通常"]);

      if (!oldEventMap[eventId]) {
        // 🆕 新しいイベント
        newEvents.push(`🆕 新しい予定:\n📝 ${eventTitle}\n📍 ${location}\n🕒 ${startTime} ~ ${endTime}`);
      } else {
        let oldEvent = oldEventMap[eventId];
        let changes = [];

        // 🔹 変更された項目を特定し、リスト化（変更がない場合は記録しない）
        if (oldEvent.title !== eventTitle) {
          changes.push(`🔸 *予定名変更:* 「${oldEvent.title}」→「${eventTitle}」`);
        }
        if (oldEvent.startTime !== startTime || oldEvent.endTime !== endTime) {
          changes.push(`🔸 *時間変更:* ${oldEvent.startTime} ~ ${oldEvent.endTime} → ${startTime} ~ ${endTime}`);
        }
        if (oldEvent.location !== location) {
          changes.push(`🔸 *場所変更:* 「${oldEvent.location}」→「${location}」`);
        }

        // 変更があった場合のみ通知を送る
        if (changes.length > 0) {
          changedEvents.push(`🔄 予定変更:\n📝 ${eventTitle}\n📍 ${location}\n🕒 ${startTime} ~ ${endTime}\n` + changes.join("\n"));
        }

        delete oldEventMap[eventId]; // 検出済みのイベントを削除
      }
    });

    // 🔄 削除されたイベントの検出（イベント名だけでなく、時間・場所も通知）
    for (let eventId in oldEventMap) {
      let oldEvent = oldEventMap[eventId];
      deletedEvents.push(`❌ 予定削除:\n📝 ${oldEvent.title}\n📍 ${oldEvent.location}\n🕒 ${oldEvent.startTime} ~ ${oldEvent.endTime}`);
    }

    return { newEventData, newEvents, changedEvents, deletedEvents };
  }

  // 📌 スプレッドシートを更新
  updateSpreadsheet(newEventData) {
    const sheet = SpreadsheetApp.openById(this.spreadsheetId).getActiveSheet();
    sheet.clear(); // 既存データをクリア
    sheet.appendRow(["イベントID", "タイトル", "開始時刻", "終了時刻", "場所", "種別"]);
    newEventData.forEach(row => sheet.appendRow(row));
  }
}