# Ellen Joe AI Companion (エレン・ジョー)

[![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-blue)](https://openclaw.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-ellen__skill-black)](https://github.com/ChaoticArray516/ellen_skill)

An OpenClaw Skill featuring **Ellen Joe** from Zenless Zone Zero, powered by GPT-SoVITS v4 Japanese TTS and Live2D dynamic expressions.

> "あー、もう…ご主人様、また残業ですか？疲れてるのに…"
> (Ah, geez... Master, working overtime again? Even though you're tired...)

## Features

- **Japanese TTS**: GPT-SoVITS v4 for high-quality Japanese voice synthesis
- **Live2D Expressions**: Real-time facial expressions synced with audio
- **Lazy Tsundere Personality**: Faithful recreation of Ellen's character
- **WebSocket Real-time**: Low-latency communication with frontend
- **Audio Caching**: LRU + TTL cache for optimized TTS performance
- **Multimodal Sync**: Synchronized audio, text, motion, and expressions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                          │
│              (React + TypeScript + Vite)                    │
│         Live2D Canvas │ Chat │ Audio Lip-Sync              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket (ws://127.0.0.1:8080)
┌─────────────────────────────────────────────────────────────┐
│                    Ellen Skill Backend                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Config      │  │ Voice       │  │ WebSocket           │ │
│  │ Loader      │──│ Bridge      │──│ Server (Port 8080)  │ │
│  │ (YAML)      │  │ (TTS API)   │  │ (Broadcast)         │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘ │
│         │                │                                  │
│         ▼                ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenClaw Skill Interface               │   │
│  │         (Claude Code / OpenClaw Integration)        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐      ┌─────────────────────────────┐
│   LLM Provider  │      │      GPT-SoVITS v4 TTS      │
│  (DeepSeek/     │      │  ┌─────────────────────┐    │
│   OpenAI/       │      │  │  api_v2.py (9880)   │    │
│   Claude)       │      │  │  ┌───────────────┐  │    │
└─────────────────┘      │  │  │  艾莲-e10.ckpt │  │    │
                         │  │  │  (GPT Model)   │  │    │
                         │  │  └───────────────┘  │    │
                         │  │  ┌───────────────┐  │    │
                         │  │  │艾莲_e10_s460   │  │    │
                         │  │  │_l32.pth        │  │    │
                         │  │  │(SoVITS Model) │  │    │
                         │  │  └───────────────┘  │    │
                         │  └─────────────────────┘    │
                         └─────────────────────────────┘
```

### GPT-SoVITS v4 Integration Details

**V4 Features:**
- **Output Sample Rate**: 48kHz (fixes muffled sound in V3)
- **Pretrained Model**: `s2Gv4.pth` (different from V3)
- **Model Components**:
  - GPT semantic model (`.ckpt`) - Text to semantic tokens
  - SoVITS VAE (`.pth`) - Acoustic feature generation
  - BigVGAN vocoder - Final waveform synthesis

**Why Not Genie-TTS?**
| Feature | Genie-TTS | GPT-SoVITS v4 (Required) |
|---------|-----------|-------------------------|
| Supported Versions | V2, V2ProPlus | **V4** ✅ |
| Model Format | ONNX | PyTorch (.ckpt + .pth) |
| Ellen V4 Model | ❌ Incompatible | ✅ Fully Compatible |

## Project Structure

```
ellen_skill/
├── openclaw.json           # Skill manifest for OpenClaw
├── config.yaml             # Unified configuration file
├── .env.example            # Environment variables template
├── packages/
│   ├── skill-backend/      # TypeScript backend
│   │   ├── src/
│   │   │   ├── index.ts           # Main entry point
│   │   │   ├── voiceBridge.ts     # TTS integration
│   │   │   ├── wsServer.ts        # WebSocket server
│   │   │   ├── configLoader.ts    # Configuration loader
│   │   │   ├── persona.ts         # Ellen's character definition
│   │   │   ├── audioCache.ts      # LRU+TTL audio cache
│   │   │   └── logger.ts          # Structured logging
│   │   └── package.json
│   ├── frontend/           # React + TypeScript frontend
│   │   ├── src/
│   │   │   ├── components/        # Live2DCanvas, etc.
│   │   │   ├── hooks/             # useEllenSkill hook
│   │   │   ├── services/          # WebSocketClient, AudioLipSync
│   │   │   └── App.tsx
│   │   └── package.json
│   └── tts-server/         # GPT-SoVITS v4 service wrapper
├── components/             # Model files
│   └── v4/艾莲/           # Ellen's GPT-SoVITS model
├── scripts/                # Test and utility scripts
│   ├── test_tts.py        # TTS connectivity test
│   └── test_ws_client.js  # WebSocket client test
└── docs/                   # Documentation
```

## 🔗 Related Repositories

| Repository | Description | Link |
|------------|-------------|------|
| **ellen_skill** | This repository - OpenClaw Skill implementation | [GitHub](https://github.com/ChaoticArray516/ellen_skill) |
| **Ellen-Live2D** | FastAPI backend version with PixiJS frontend | [GitHub](https://github.com/ChaoticArray516/Ellen-Live2D) |
| **GPT-SoVITS** | Official TTS engine with V4 support | [GitHub](https://github.com/RVC-Boss/GPT-SoVITS) |

## 🗂️ Model Files (Download Required)

The following files are **NOT included** in this repository due to size limits (excluded via `.gitignore`):

| File | Size | Location | Description |
|------|------|----------|-------------|
| `艾莲-e10.ckpt` | ~155MB | `components/v4/艾莲/` | GPT model checkpoint |
| `艾莲_e10_s460_l32.pth` | ~75MB | `components/v4/艾莲/` | SoVITS model weights |
| Reference Audio | ~280KB | `components/v4/艾莲/reference_audios/日语/emotions/` | Emotion reference WAV |

### Setup Model Files

```bash
# Create model directory
mkdir -p components/v4/艾莲/reference_audios/日语/emotions

# Copy your trained model files here
cp /path/to/your/艾莲-e10.ckpt components/v4/艾莲/
cp /path/to/your/艾莲_e10_s460_l32.pth components/v4/艾莲/
cp /path/to/your/reference.wav components/v4/艾莲/reference_audios/日语/emotions/
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Python 3.8+ (for GPT-SoVITS)
- [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) v4 running on port 9880

### Installation

1. **Clone the repository**
   ```bash
   cd apps/chioko_skill/workspace
   git clone <repository-url> ellen_skill
   cd ellen_skill
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd packages/skill-backend && npm install
   cd ../frontend && npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your LLM API key
   # LLM_API_KEY=your_api_key_here
   ```

4. **Verify GPT-SoVITS is running**
   ```bash
   python scripts/test_tts.py
   ```

### Running the Skill

**Development Mode:**
```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend
npm run dev:frontend
```

**Production Mode:**
```bash
npm run build
npm start
```

### Testing

```bash
# Run unit tests
cd packages/skill-backend
npm test

# Test WebSocket client
node scripts/test_ws_client.js

# Test TTS service
python scripts/test_tts.py
```

## Configuration

Edit `config.yaml` to customize:

```yaml
llm:
  provider: deepseek          # openai | deepseek | claude | gemini
  api_key: ""                 # Or use LLM_API_KEY env var
  base_url: "https://api.deepseek.com"
  model: "deepseek-chat"

tts:
  api_url: "http://127.0.0.1:9880"
  language: "ja"
  params:
    speed_factor: 0.9         # 0.9 =慵懒语速
    sample_steps: 32          # V4 quality parameter

websocket:
  host: "127.0.0.1"
  port: 8080
```

## 🖥️ Cross-Platform Deployment (No Docker)

### Windows

```powershell
# 1. Install Python 3.11
winget install Python.Python.3.11

# 2. Create virtual environment
python -m venv venv
.\venv\Scripts\activate

# 3. Install PyTorch (CUDA 12.4)
pip install torch==2.5.1+cu124 --extra-index-url https://download.pytorch.org/whl/cu124

# 4. Install GPT-SoVITS dependencies
pip install -r requirements.txt

# 5. Start GPT-SoVITS API server
python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml
```

### macOS (Apple Silicon)

```bash
# 1. Install Python 3.11
brew install python@3.11

# 2. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 3. Install PyTorch (CPU/MPS for Apple Silicon)
pip install torch==2.5.1 --extra-index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# 4. Start service
python api_v2.py -a 127.0.0.1 -p 9880
```

### Linux (Ubuntu/Debian)

```bash
# 1. Install dependencies
sudo apt update
sudo apt install python3.11 python3.11-venv ffmpeg

# 2. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 3. Install PyTorch (CUDA 12.4)
pip install torch==2.5.1+cu124 --extra-index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt

# 4. Start service
python api_v2.py -a 127.0.0.1 -p 9880
```

## Ellen's Character

**Ellen Joe (エレン・ジョー)** from Zenless Zone Zero

- **CV**: Wakayama Shion (若山詩音)
- **Personality**: Lazy tsundere maid girlfriend
- **Trust Level**: 100 (max from start)
- **Special**: Allows tail touching (ultimate trust)
- **Quirk**: Gets "hangry" when low on blood sugar

### Available Expressions

| Expression | Description |
|------------|-------------|
| `lazy` | Default慵懒 expression |
| `maid` | Professional service smile |
| `predator` | Combat/predatory mode |
| `hangry` | Low blood sugar state |
| `shy` | Embarrassed (tail touched) |
| `surprised` | Shocked reaction |
| `happy` | Genuine happiness (rare) |

### Response Format

Ellen's LLM responses include motion and expression tags:

```
[motion:idle][exp:lazy] おはようございます、ご主人様。
[motion:idle2][exp:shy] …尻尾、触っていいですよ。特別に。
```

## API Reference

### WebSocket Protocol

**Multimodal Sync Packet:**
```typescript
{
  type: 'multimodal_sync',
  motionId: 'idle',
  expressionId: 'lazy',
  text: 'おはようございます',
  audioData: 'base64_encoded_wav',
  sampleRate: 32000,
  duration: 2.5,
  hasAudio: true,
  timestamp: 1709123456789
}
```

**Status Messages:**
```typescript
{
  type: 'status',
  status: 'thinking' | 'speaking' | 'ready' | 'error',
  timestamp: 1709123456789
}
```

### Voice Bridge API

```typescript
// Parse LLM response with tags
const parsed = parseLLMResponse('[motion:idle][exp:lazy] おはよう');
// Returns: { motionId: 'idle', expressionId: 'lazy', cleanText: 'おはよう' }

// Synthesize speech with caching
const result = await synthesizeSpeech(rawText, config);
// Returns: { audioData, sampleRate, duration, motionId, expressionId }
```

## Performance Optimizations

### Audio Cache (LRU + TTL)

- **Max Entries**: 50 cached TTS results
- **TTL**: 30 minutes
- **Cleanup**: Every 5 minutes
- **Key**: SHA256 hash of `${text}:${expressionId}`

### Retry Logic

- **Strategy**: Exponential backoff
- **Delays**: 1s → 2s → 4s
- **Max Retries**: 3 attempts

### Structured Logging

```
[2024-01-15T10:30:00.000Z] [INFO] [VoiceBridge] TTS synthesis successful
[2024-01-15T10:30:00.100Z] [INFO] [WSServer] Broadcasted to 2 clients
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| TTS service not found | Ensure GPT-SoVITS is running on port 9880 |
| WebSocket connection failed | Check if backend is running on port 8080 |
| Audio not playing | Verify `AudioContext` is initialized on user interaction |
| Model files not found | Check paths in `config.yaml` are absolute |
| CUDA out of memory | Reduce `batch_size` or use CPU mode |
| Japanese text not synthesizing | Ensure text contains valid Japanese characters |

### GPT-SoVITS V4 Integration

**Model Loading:**
```python
# Switch to Ellen V4 model
import requests

# Load GPT model
requests.get("http://127.0.0.1:9880/set_gpt_weights", params={
    "weights_path": "/absolute/path/to/艾莲-e10.ckpt"
})

# Load SoVITS model
requests.get("http://127.0.0.1:9880/set_sovits_weights", params={
    "weights_path": "/absolute/path/to/艾莲_e10_s460_l32.pth"
})
```

**Optimal TTS Parameters for Ellen:**
```json
{
  "text": "おはよう、ご主人様",
  "text_lang": "ja",
  "ref_audio_path": "/path/to/reference.wav",
  "prompt_text": "それで戦い方とかはいつ覚えるの？",
  "prompt_lang": "ja",
  "top_k": 5,
  "top_p": 0.8,
  "temperature": 0.75,
  "speed_factor": 0.9,
  "sample_steps": 32
}
```

### Cross-Platform Path Handling

```typescript
// Use path.join for cross-platform compatibility
import path from 'path';

// ✅ Correct
const modelPath = path.join(process.cwd(), 'components', 'v4', '艾莲');

// ❌ Incorrect (Windows-only)
const modelPath = `${baseDir}/components/v4/艾莲`;
```

## License

MIT License - See [LICENSE](LICENSE) for details.

## Acknowledgments

- **Zenless Zone Zero** - HoYoverse for Ellen Joe character
- **GPT-SoVITS** - RVC-Boss for the amazing TTS technology
- **Live2D Cubism** - For the animation SDK
- **OpenClaw** - The AI agent framework

---

<p align="center">
  <i>"もう…しょうがないですね、ご主人様。"</i><br>
  <i>(Geez... you're hopeless, Master.)</i>
</p>
