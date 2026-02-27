#!/usr/bin/env python3
"""
Converte o modelo KOLBR Analyst (LoRA adapters) para GGUF.
Passos: 1) Merge LoRA no base 2) Salvar safetensors 3) Converter para GGUF

Requer: pip install transformers peft gguf
Ou use llama.cpp para conversão: https://github.com/ggerganov/llama.cpp

Uso:
  python scripts/convert_to_gguf.py --adapter ./kolbr-analyst-7b --base Qwen/Qwen2.5-7B-Instruct --output ./kolbr-analyst-7b-merged
"""
import argparse
import os
from pathlib import Path

from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="Qwen/Qwen2.5-7B-Instruct", help="Modelo base")
    p.add_argument("--adapter", default="./kolbr-analyst-7b", help="Diretório dos adapters LoRA")
    p.add_argument("--output", default="./kolbr-analyst-7b-merged", help="Diretório de saída (merged)")
    return p.parse_args()


def main():
    args = parse_args()

    if not os.path.exists(args.adapter):
        print(f"[convert] Adapter não encontrado: {args.adapter}")
        print("[convert] Treine primeiro com: python scripts/train_kolbr_analyst.py")
        return 1

    print(f"[convert] Carregando base: {args.base}")
    model = AutoModelForCausalLM.from_pretrained(
        args.base,
        device_map="auto",
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.base, trust_remote_code=True)

    print(f"[convert] Carregando adapters: {args.adapter}")
    model = PeftModel.from_pretrained(model, args.adapter)
    model = model.merge_and_unload()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[convert] Salvando modelo merged em {args.output}")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    print("[convert] Merge concluído. Para GGUF:")
    print("  1. Use llama.cpp: python convert-hf-to-gguf.py <output> --outfile kolbr-analyst-7b.gguf")
    print("  2. Ou Unsloth: unsloth export --model <output> --q4_k_m")
    return 0


if __name__ == "__main__":
    exit(main())
