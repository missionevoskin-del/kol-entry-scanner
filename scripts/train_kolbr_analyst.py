#!/usr/bin/env python3
"""
KOLBR Analyst - Fine-tuning SFT + QLoRA
Base: Qwen/Qwen2.5-7B-Instruct
Dataset: kolbr_dataset.jsonl (formato messages)

Uso:
  python scripts/train_kolbr_analyst.py
  python scripts/train_kolbr_analyst.py --dataset ./kolbr_dataset.jsonl --output ./kolbr-analyst-7b

HF Jobs:
  hf jobs run --flavor "1x Nvidia L4" --timeout 4h --with transformers,datasets,peft,trl,bitsandbytes,accelerate scripts/train_kolbr_analyst.py
"""
import argparse
import json
import os
from pathlib import Path

from datasets import Dataset
from peft import LoraConfig
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct", help="Modelo base")
    p.add_argument("--dataset", default=None, help="Caminho para kolbr_dataset.jsonl")
    p.add_argument("--output", default="./kolbr-analyst-7b", help="Diretório de saída")
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--batch-size", type=int, default=4)
    p.add_argument("--lr", type=float, default=2e-5)
    p.add_argument("--max-seq-length", type=int, default=512)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    return p.parse_args()


def load_dataset_jsonl(path: str) -> Dataset:
    """Carrega JSONL no formato { messages: [...] } e converte para Dataset."""
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            rows.append(obj)
    return Dataset.from_list(rows)


def main():
    args = parse_args()

    script_dir = Path(__file__).parent.resolve()
    dataset_path = args.dataset or (script_dir / "kolbr_dataset.jsonl")
    if not os.path.exists(dataset_path):
        dataset_path = script_dir / "kolbr_dataset_sample.jsonl"
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(
            "Nenhum dataset encontrado. Crie kolbr_dataset.jsonl ou use kolbr_dataset_sample.jsonl"
        )

    print(f"[train] Carregando dataset: {dataset_path}")
    ds = load_dataset_jsonl(str(dataset_path))
    print(f"[train] {len(ds)} exemplos")

    model_id = args.model
    print(f"[train] Modelo base: {model_id}")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype="bfloat16",
        bnb_4bit_use_double_quant=True,
    )

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )

    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    def format_fn(example):
        messages = example.get("messages", [])
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )
        return {"text": text}

    ds_formatted = ds.map(format_fn, remove_columns=ds.column_names)

    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.lr,
        fp16=True,
        logging_steps=10,
        save_strategy="epoch",
        save_total_limit=2,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=ds_formatted,
        peft_config=peft_config,
        processing_class=tokenizer,
        max_seq_length=args.max_seq_length,
        dataset_text_field="text",
        packing=True,
    )

    print("[train] Iniciando treino...")
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"[train] Modelo salvo em {args.output}")


if __name__ == "__main__":
    main()
