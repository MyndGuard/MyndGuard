# 🧠 MyndGuard – Family Wellness Monitor

A Chrome extension that uses AI to analyze browsing patterns and provide gentle mental wellness insights for personal and family use.

---

## 📦 Installation (Developer Mode)

1. **Download** and unzip the `myndguard-extension` folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in the top right)
4. Click **"Load unpacked"**
5. Select the `myndguard-extension` folder
6. The MyndGuard icon will appear in your Chrome toolbar ✅

---

## 🔑 Setup

1. Click the MyndGuard icon in Chrome
2. Go to the **Settings** tab
3. Enter your **Anthropic API key** (get one at [console.anthropic.com](https://console.anthropic.com))
4. Optionally enter a profile name (e.g. "Family")
5. Click **Save Settings**

---

## 🚀 Usage

- Click **"Analyze Now"** to run an immediate analysis of the last 24 hours
- Analysis runs automatically every 6 hours in the background
- View **Insights** for wellness score, summary, and recommendations
- View **Patterns** for category breakdown and detected behavioral patterns
- View **History** for past analyses

---

## 🔒 Privacy

- **No raw URLs are ever stored or transmitted** — only anonymized category summaries
- Your API key is stored locally on your device only
- All browsing data is processed locally; only a category summary is sent to Claude AI
- No data is shared with third parties

---

## 📊 What It Analyzes

MyndGuard looks at:
- **Browse categories**: news, social media, health searches, shopping, entertainment
- **Time patterns**: peak hours, late-night browsing
- **Frequency**: how often certain category types appear
- **Signals**: patterns that may indicate stress, anxiety, doom-scrolling, or positive wellness habits

---

## ⚠️ Important Disclaimer

MyndGuard is a **personal wellness tool**, not a medical device. AI-inferred patterns are not clinical diagnoses. If you have serious mental health concerns, please consult a qualified professional.

---

## 🛠 Technical Notes

- Built with Chrome Manifest V3
- Uses Claude claude-sonnet-4-20250514 for pattern analysis
- Browsing data never leaves your device except as anonymized summaries to the Anthropic API
- History log keeps last 30 analyses
