"use client";

import Image from "next/image";
import type { ChangeEvent, CSSProperties } from "react";
import {
  PET_ACCENT_COLORS,
  PET_BODY_COLORS,
  PET_EAR_STYLES,
  PET_MARKING_STYLES,
  PET_PERSONALITIES,
  PRIVATE_FRAME_SLOTS,
  type PetCustomization,
  type PrivateFrameImages,
  type PrivateFrameSlot,
} from "@/lib/profile-space-customization";
import {
  cleanRoomCompanionName,
  normalizeRoomCompanionName,
  ROOM_COMPANION_NAME,
  ROOM_COMPANION_NAME_MAX_LENGTH,
} from "@/lib/room-companion";

export type MoveInStep = "pet" | "photos";

type MoveInStudioProps = {
  step: MoveInStep;
  pet: PetCustomization;
  frameImages: PrivateFrameImages;
  ready: boolean;
  photoMessage: string;
  onStepChange: (step: MoveInStep) => void;
  onPetChange: (pet: PetCustomization) => void;
  onPhotosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFrameChange: (slot: PrivateFrameSlot, event: ChangeEvent<HTMLInputElement>) => void;
  onFrameRemove: (slot: PrivateFrameSlot) => void;
  onEnter: () => void;
};

function choiceClass(selected: boolean) {
  return selected ? "is-selected" : "";
}

export function MoveInStudio({
  step,
  pet,
  frameImages,
  ready,
  photoMessage,
  onStepChange,
  onPetChange,
  onPhotosChange,
  onFrameChange,
  onFrameRemove,
  onEnter,
}: MoveInStudioProps) {
  const photoCount = Object.keys(frameImages).length;
  const companionName = normalizeRoomCompanionName(pet.name);
  const previewStyle = {
    "--pet-body": pet.bodyColor,
    "--pet-accent": pet.accentColor,
  } as CSSProperties;

  return (
    <section className="creation-studio" aria-label="宠物与空间照片设置">
      <header className="creation-studio-heading">
        <div>
          <span>MOVE-IN STUDIO / LOCAL</span>
          <h2>{step === "pet" ? `先捏一个属于你的${companionName}` : "把照片放进二楼相框"}</h2>
        </div>
        <strong>{step === "pet" ? "01" : "02"} / 02</strong>
      </header>

      <nav className="move-in-tabs" aria-label="入住设置步骤">
        <button type="button" className={choiceClass(step === "pet")} onClick={() => onStepChange("pet")}>
          <span>01</span> 捏宠物
        </button>
        <button type="button" className={choiceClass(step === "photos")} onClick={() => onStepChange("photos")}>
          <span>02</span> 传照片
        </button>
      </nav>

      {step === "pet" ? (
        <div className="move-in-pet-step">
          <label className="pet-name-field" htmlFor="move-in-pet-name">
            <span>给它起个名字</span>
            <input
              id="move-in-pet-name"
              value={pet.name}
              maxLength={ROOM_COMPANION_NAME_MAX_LENGTH}
              placeholder={ROOM_COMPANION_NAME}
              autoComplete="off"
              onChange={(event) => onPetChange({ ...pet, name: cleanRoomCompanionName(event.target.value) })}
            />
            <small>最多 {ROOM_COMPANION_NAME_MAX_LENGTH} 个字符，会同步到小家和对话里。</small>
          </label>
          <div
            className={`pet-builder-preview is-${pet.earStyle} has-${pet.markingStyle}`}
            style={previewStyle}
            aria-label={`${companionName}外观预览`}
          >
            <strong className="pet-preview-name">{companionName}</strong>
            <span className="pet-preview-shadow" />
            <span className="pet-preview-tail" />
            <span className="pet-preview-body" />
            <span className="pet-preview-ear is-left" />
            <span className="pet-preview-ear is-right" />
            <span className="pet-preview-head">
              <i className="pet-preview-marking" />
              <i className="pet-preview-eye is-left" />
              <i className="pet-preview-eye is-right" />
              <i className="pet-preview-nose" />
            </span>
            <span className="pet-preview-ring" />
          </div>

          <div className="pet-builder-controls">
            <fieldset>
              <legend>毛色</legend>
              <div className="pet-color-options">
                {PET_BODY_COLORS.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={choiceClass(pet.bodyColor === choice.value)}
                    style={{ backgroundColor: choice.value }}
                    onClick={() => onPetChange({ ...pet, bodyColor: choice.value })}
                    aria-label={`毛色：${choice.label}`}
                    aria-pressed={pet.bodyColor === choice.value}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>点缀色</legend>
              <div className="pet-color-options">
                {PET_ACCENT_COLORS.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={choiceClass(pet.accentColor === choice.value)}
                    style={{ backgroundColor: choice.value }}
                    onClick={() => onPetChange({ ...pet, accentColor: choice.value })}
                    aria-label={`点缀色：${choice.label}`}
                    aria-pressed={pet.accentColor === choice.value}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>耳朵</legend>
              <div className="pet-text-options">
                {PET_EAR_STYLES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={choiceClass(pet.earStyle === choice.value)}
                    onClick={() => onPetChange({ ...pet, earStyle: choice.value })}
                    aria-pressed={pet.earStyle === choice.value}
                  >{choice.label}</button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>脸部花纹</legend>
              <div className="pet-text-options">
                {PET_MARKING_STYLES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={choiceClass(pet.markingStyle === choice.value)}
                    onClick={() => onPetChange({ ...pet, markingStyle: choice.value })}
                    aria-pressed={pet.markingStyle === choice.value}
                  >{choice.label}</button>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="pet-personality-picker">
            <legend>选择性格 · 会影响{companionName}回答你的语气</legend>
            <div>
              {PET_PERSONALITIES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className={choiceClass(pet.personality === choice.value)}
                  onClick={() => onPetChange({ ...pet, personality: choice.value })}
                  aria-pressed={pet.personality === choice.value}
                >
                  <strong>{choice.label}</strong>
                  <small>{choice.description}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <button className="creation-next" type="button" onClick={() => onStepChange("photos")}>
            <span>下一步 · 上传空间照片</span><span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div className="move-in-photo-step">
          <p>最多选择 6 张照片。图片会压缩后仅保存在当前浏览器，并分别进入二楼现有的 6 个自由相框。</p>
          <div className="move-in-photo-actions">
            <label htmlFor="move-in-photo-upload">批量选择照片</label>
            <input id="move-in-photo-upload" type="file" accept="image/*" multiple onChange={onPhotosChange} />
            <span>{photoCount} / {PRIVATE_FRAME_SLOTS.length} 已放入</span>
          </div>
          <div className="move-in-photo-grid" aria-label="二楼相框照片">
            {PRIVATE_FRAME_SLOTS.map((slot, index) => {
              const image = frameImages[slot];
              return (
                <article key={slot} className={image ? "has-image" : ""}>
                  <header><span>FRAME {String(index + 1).padStart(2, "0")}</span><small>{image ? "已放入" : "空相框"}</small></header>
                  {image ? (
                    <Image src={image} alt={`相框 ${index + 1} 照片预览`} width={240} height={180} unoptimized />
                  ) : <div className="move-in-photo-empty" aria-hidden="true"><span>＋</span></div>}
                  <div>
                    <label htmlFor={`move-in-${slot}`}>{image ? "替换" : "选择"}</label>
                    <input id={`move-in-${slot}`} type="file" accept="image/*" onChange={(event) => onFrameChange(slot, event)} />
                    {image ? <button type="button" onClick={() => onFrameRemove(slot)}>移除</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="move-in-photo-message" aria-live="polite">{photoMessage}</div>
          <div className="move-in-final-actions">
            <button type="button" onClick={() => onStepChange("pet")}>← 返回捏宠物</button>
            <button className="creation-enter" type="button" disabled={!ready} onClick={onEnter}>
              <span>{ready ? `带着${companionName}进入小家` : "Agent 还在搭建中"}</span>
              <span aria-hidden="true">{ready ? "→" : "···"}</span>
            </button>
          </div>
          <small className="creation-draft-note">宠物名字、外观、性格和照片会跟随当前 Profile 保存；日记进入世界后再写。</small>
        </div>
      )}
    </section>
  );
}
