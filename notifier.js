class LineNotifier {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiUrl = "https://api.line.me/v2/bot/message";
  }

  // 共通のリクエスト送信処理
  sendRequest(endpoint, payload) {
    const url = `${this.apiUrl}/${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + this.accessToken
    };

    const options = {
      "method": "post",
      "headers": headers,
      "payload": JSON.stringify(payload)
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      Logger.log(`送信成功: ${response.getContentText()}`);
    } catch (e) {
      Logger.log(`エラー発生: ${e.toString()}`);
    }
  }

  // 個別送信
  sendToUser(message, userId) {
    if (!userId) {
      Logger.log("エラー: ユーザーIDが設定されていません");
      return;
    }

    const payload = {
      "to": userId,
      "messages": [{ "type": "text", "text": message }]
    };

    this.sendRequest("push", payload);
  }

  // 全員に送信
  sendToAll(message) {
    const payload = {
      "messages": [{ "type": "text", "text": message }]
    };

    this.sendRequest("broadcast", payload);
  }
}