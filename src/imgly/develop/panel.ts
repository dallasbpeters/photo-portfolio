import type CreativeEditorSDK from '@cesdk/cesdk-js';
import {
  ADJUSTMENT_GROUPS,
  adjustmentProperty,
  applyAdjustments,
  ensureAdjustmentsEffect,
  fromDisplay,
  readAdjustments,
  resetAdjustments,
  toDisplay,
} from './adjustments';
import {
  effectProperty,
  ensureEffect,
  FINISHING_EFFECTS,
  isEffectOn,
  setEffectOn,
  type FinishingDef,
} from './effects';
import {
  BUILT_IN_PRESETS,
  deleteUserPreset,
  loadUserPresets,
  saveUserPreset,
  type DevelopPreset,
} from './presets';

export const DEVELOP_PANEL_ID = '//addison.photo/panel/develop';

/** A finishing effect resolved for this render, with its on/off state handle. */
type ResolvedFinishing = {
  def: FinishingDef;
  effectId: number;
  isOn: boolean;
  setOn: (on: boolean) => void;
};

/**
 * Registers the Develop panel: the non-destructive retouching stack for the page
 * image — tone, presence, colour, finishing effects, before/after compare and
 * saved looks.
 *
 * Controls write straight to the engine, so edits are live on canvas and are
 * picked up by the existing export/save path with no extra plumbing.
 */
export function registerDevelopPanel(cesdk: CreativeEditorSDK, siteKey: string): void {
  cesdk.ui.registerPanel(DEVELOP_PANEL_ID, ({ builder, engine, state }) => {
    const page = engine.scene.getCurrentPage();
    if (page == null) {
      builder.Section('develop.empty', {
        title: 'Develop',
        children: () => {
          builder.Text('develop.empty.text', { content: 'Open a photo to start editing.' });
        },
      });
      return;
    }

    const adjustments = ensureAdjustmentsEffect(engine, page);
    if (adjustments == null) {
      builder.Section('develop.unsupported', {
        title: 'Develop',
        children: () => {
          builder.Text('develop.unsupported.text', {
            content: 'This layer does not support adjustments.',
          });
        },
      });
      return;
    }

    // ── Resolve all state up front ────────────────────────────────────────────
    // `state()` belongs to the render pass, so every handle is created here and
    // the callbacks below close over plain values rather than calling state()
    // again at click time.
    const comparing = state<boolean>('develop.comparing', false);

    const finishing: ResolvedFinishing[] = [];
    for (const def of FINISHING_EFFECTS) {
      const effectId = ensureEffect(engine, page, def.type);
      if (effectId == null) continue;
      const handle = state<boolean>(`develop.on.${def.id}`, isEffectOn(engine, effectId));
      finishing.push({
        def,
        effectId,
        isOn: handle.value,
        setOn: (on) => {
          handle.setValue(on);
          setEffectOn(engine, effectId, on);
        },
      });
    }

    const userPresets = state<DevelopPreset[]>('develop.presets', loadUserPresets(siteKey));
    const draftName = state<string>('develop.preset.name', '');

    // While comparing, freeze the controls so a stray drag can't be attributed
    // to the "original" view.
    const isDisabled = comparing.value;

    // ── Before / after ────────────────────────────────────────────────────────
    builder.Section('develop.compare', {
      children: () => {
        builder.Button('develop.compare.toggle', {
          label: comparing.value ? 'Showing original' : 'Compare to original',
          icon: '@imgly/Eye',
          isActive: comparing.value,
          onClick: () => {
            const showOriginal = !comparing.value;
            comparing.setValue(showOriginal);

            setEffectOn(engine, adjustments, !showOriginal);
            // A finishing effect the user never switched on stays off, so
            // comparing can't reveal a vignette that was not part of the edit.
            for (const item of finishing) {
              if (!item.isOn) continue;
              setEffectOn(engine, item.effectId, !showOriginal);
            }
          },
        });

        builder.Button('develop.reset.all', {
          label: 'Reset all',
          color: 'danger',
          variant: 'plain',
          onClick: () => {
            resetAdjustments(engine, adjustments);
            setEffectOn(engine, adjustments, true);
            for (const item of finishing) item.setOn(false);
            comparing.setValue(false);
          },
        });
      },
    });

    // ── Tone / Presence / Color ───────────────────────────────────────────────
    for (const group of ADJUSTMENT_GROUPS) {
      builder.Section(`develop.${group.id}`, {
        title: group.title,
        children: () => {
          for (const def of group.items) {
            const property = adjustmentProperty(def.key);
            let current: number;
            try {
              current = engine.block.getFloat(adjustments, property);
            } catch {
              continue; // property absent from this SDK build
            }

            builder.Slider(`develop.${group.id}.${def.key}`, {
              inputLabel: def.label,
              min: toDisplay(def.min),
              max: toDisplay(def.max),
              step: 1,
              centered: def.centered,
              isDisabled,
              value: toDisplay(current),
              setValue: (next) => {
                engine.block.setFloat(adjustments, property, fromDisplay(next));
              },
            });
          }
        },
      });
    }

    // ── Finishing ─────────────────────────────────────────────────────────────
    for (const item of finishing) {
      builder.Section(`develop.${item.def.id}`, {
        title: item.def.label,
        children: () => {
          builder.Checkbox(`develop.${item.def.id}.enabled`, {
            inputLabel: `Enable ${item.def.label.toLowerCase()}`,
            isDisabled,
            value: item.isOn,
            setValue: (next) => item.setOn(next),
          });

          if (!item.isOn) return;

          for (const control of item.def.controls) {
            const property = effectProperty(item.def.type, control.key);
            let current: number;
            try {
              current = engine.block.getFloat(item.effectId, property);
            } catch {
              continue;
            }

            builder.Slider(`develop.${item.def.id}.${control.key}`, {
              inputLabel: control.label,
              min: toDisplay(control.min),
              max: toDisplay(control.max),
              step: 1,
              centered: control.centered,
              isDisabled,
              value: toDisplay(current),
              setValue: (next) => {
                engine.block.setFloat(item.effectId, property, fromDisplay(next));
              },
            });
          }
        },
      });
    }

    // ── Looks ─────────────────────────────────────────────────────────────────
    builder.Section('develop.presets', {
      title: 'Looks',
      children: () => {
        const apply = (preset: DevelopPreset) => {
          // Start from neutral so applying a look replaces the grade rather than
          // stacking onto whatever was already dialled in.
          resetAdjustments(engine, adjustments);
          applyAdjustments(engine, adjustments, preset.adjustments);
        };

        for (const preset of BUILT_IN_PRESETS) {
          builder.Button(`develop.preset.builtin.${preset.name}`, {
            label: preset.name,
            variant: 'plain',
            labelAlignment: 'left',
            isDisabled,
            onClick: () => apply(preset),
          });
        }

        if (userPresets.value.length > 0) {
          builder.Separator('develop.presets.separator');

          for (const preset of userPresets.value) {
            builder.Button(`develop.preset.user.${preset.name}`, {
              label: preset.name,
              variant: 'plain',
              labelAlignment: 'left',
              isDisabled,
              onClick: () => apply(preset),
            });
            builder.Button(`develop.preset.delete.${preset.name}`, {
              label: `Delete ${preset.name}`,
              variant: 'plain',
              color: 'danger',
              isDisabled,
              onClick: () => userPresets.setValue(deleteUserPreset(siteKey, preset.name)),
            });
          }
        }

        builder.TextInput('develop.preset.name', {
          inputLabel: 'Save current as',
          // Applied on each keystroke so Save enables as you type rather than
          // only after Enter or blur.
          requireConfirm: false,
          isDisabled,
          value: draftName.value,
          setValue: (next) => draftName.setValue(next),
        });

        builder.Button('develop.preset.save', {
          label: 'Save look',
          icon: '@imgly/Save',
          isDisabled: isDisabled || draftName.value.trim() === '',
          onClick: () => {
            const name = draftName.value.trim();
            if (!name) return;
            userPresets.setValue(
              saveUserPreset(siteKey, {
                name,
                adjustments: readAdjustments(engine, adjustments),
              }),
            );
            draftName.setValue('');
          },
        });
      },
    });
  });
}

/** Dock entry that opens the Develop panel, replacing the stock Adjust entry. */
export const developDockEntry = (cesdk: CreativeEditorSDK) => ({
  id: 'ly.img.assetLibrary.dock',
  key: 'develop',
  icon: '@imgly/Adjustments',
  label: 'Develop',
  entries: [],
  isSelected: () => cesdk.ui.isPanelOpen(DEVELOP_PANEL_ID),
  onClick: () => {
    if (cesdk.ui.isPanelOpen(DEVELOP_PANEL_ID)) {
      cesdk.ui.closePanel(DEVELOP_PANEL_ID);
      return;
    }
    const page = cesdk.engine.scene.getCurrentPage();
    if (page == null) return;
    cesdk.ui.closePanel('*');
    cesdk.engine.editor.setEditMode('Transform');
    cesdk.engine.block.select(page);
    cesdk.ui.openPanel(DEVELOP_PANEL_ID);
  },
});
