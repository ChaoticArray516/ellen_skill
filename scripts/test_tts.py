#!/usr/bin/env python3
"""
TTS Service Connectivity Test for Ellen Skill

Tests GPT-SoVITS v4 service availability and basic TTS functionality.
"""

import requests
import os
import sys

# Configuration
TTS_API_URL = "http://127.0.0.1:9880"
REF_AUDIO_PATH = os.path.abspath(
    "components/v4/艾莲/reference_audios/日语/emotions/【默认】それで戦い方とかはいつ覚えんの？.wav"
)


def test_tts_service():
    """Test TTS service connectivity and synthesis"""
    print("[TTS Test] Starting GPT-SoVITS v4 TTS service test...")
    print(f"[TTS Test] API URL: {TTS_API_URL}")
    print(f"[TTS Test] Reference audio: {REF_AUDIO_PATH}")

    # Check if reference audio exists
    if not os.path.exists(REF_AUDIO_PATH):
        print(f"[TTS Test] ERROR: Reference audio not found: {REF_AUDIO_PATH}")
        return False

    try:
        # Prepare TTS request
        payload = {
            "text": "おはよう、ご主人様。また会いましたね。",
            "text_lang": "ja",
            "ref_audio_path": REF_AUDIO_PATH,
            "prompt_text": "それで戦い方とかはいつ覚えるの？",
            "prompt_lang": "ja",
            "top_k": 5,
            "top_p": 0.8,
            "temperature": 0.75,
            "speed_factor": 0.9,
            "sample_steps": 32,
            "super_sampling": True,
            "batch_size": 1,
            "streaming_mode": False,
        }

        print("[TTS Test] Sending TTS request...")
        response = requests.post(
            f"{TTS_API_URL}/tts",
            json=payload,
            timeout=60
        )

        # Check response
        print(f"[TTS Test] Status Code: {response.status_code}")
        print(f"[TTS Test] Content-Type: {response.headers.get('content-type', 'unknown')}")
        print(f"[TTS Test] Audio size: {len(response.content)} bytes")

        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            if 'audio' in content_type or len(response.content) > 10000:
                # Save test audio
                output_path = "/tmp/test_ellen_tts.wav"
                with open(output_path, "wb") as f:
                    f.write(response.content)
                print(f"[TTS Test] SUCCESS: Audio saved to {output_path}")
                return True
            else:
                print(f"[TTS Test] ERROR: Unexpected response type: {content_type}")
                return False
        else:
            print(f"[TTS Test] ERROR: HTTP {response.status_code}")
            print(f"[TTS Test] Response: {response.text[:200]}")
            return False

    except requests.exceptions.ConnectionError:
        print("[TTS Test] ERROR: Cannot connect to TTS service")
        print(f"[TTS Test] Make sure GPT-SoVITS is running at {TTS_API_URL}")
        return False
    except Exception as e:
        print(f"[TTS Test] ERROR: {str(e)}")
        return False


def test_model_switch():
    """Test model switching endpoints"""
    print("\n[TTS Test] Testing model switch endpoints...")

    gpt_path = os.path.abspath("components/v4/艾莲/艾莲-e10.ckpt")
    sovits_path = os.path.abspath("components/v4/艾莲/艾莲_e10_s460_l32.pth")

    print(f"[TTS Test] GPT model: {gpt_path}")
    print(f"[TTS Test] SoVITS model: {sovits_path}")

    if not os.path.exists(gpt_path):
        print(f"[TTS Test] WARNING: GPT model not found: {gpt_path}")
        return False

    if not os.path.exists(sovits_path):
        print(f"[TTS Test] WARNING: SoVITS model not found: {sovits_path}")
        return False

    try:
        # Test GPT weight loading
        print("[TTS Test] Loading GPT weights...")
        gpt_response = requests.get(
            f"{TTS_API_URL}/set_gpt_weights",
            params={"weights_path": gpt_path},
            timeout=30
        )
        print(f"[TTS Test] GPT load response: {gpt_response.text}")

        # Test SoVITS weight loading
        print("[TTS Test] Loading SoVITS weights...")
        sovits_response = requests.get(
            f"{TTS_API_URL}/set_sovits_weights",
            params={"weights_path": sovits_path},
            timeout=30
        )
        print(f"[TTS Test] SoVITS load response: {sovits_response.text}")

        if gpt_response.text == "success" and sovits_response.text == "success":
            print("[TTS Test] Model switch: SUCCESS")
            return True
        else:
            print("[TTS Test] Model switch: FAILED")
            return False

    except Exception as e:
        print(f"[TTS Test] ERROR: {str(e)}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Ellen Skill TTS Service Test")
    print("=" * 60)

    # Run tests
    tts_ok = test_tts_service()
    model_ok = test_model_switch()

    print("\n" + "=" * 60)
    print("Test Results:")
    print(f"  TTS Synthesis: {'PASS' if tts_ok else 'FAIL'}")
    print(f"  Model Switch:  {'PASS' if model_ok else 'FAIL'}")
    print("=" * 60)

    sys.exit(0 if (tts_ok and model_ok) else 1)
