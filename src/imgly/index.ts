import CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  BlurAssetSource,
  ColorPaletteAssetSource,
  CropPresetsAssetSource,
  EffectsAssetSource,
  FiltersAssetSource,
  PagePresetsAssetSource,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  VectorShapeAssetSource,
} from '@cesdk/cesdk-js/plugins';

import { PhotoEditorConfig } from './config/plugin';
import { registerDevelopPanel } from './develop/panel';
import { site } from '../site';

export { PhotoEditorConfig } from './config/plugin';
export { DEVELOP_PANEL_ID } from './develop/panel';

export type InitPhotoEditorOptions = {
  /** Called when the user clicks "Save". Receives the exported PNG blob. */
  onSave?: (blob: Blob) => void | Promise<void>;
};

export async function initPhotoEditor(
  cesdk: CreativeEditorSDK,
  options: InitPhotoEditorOptions = {},
) {
  await cesdk.addPlugin(new PhotoEditorConfig());

  cesdk.ui.setTheme('dark');

  // Registered before the dock renders so the Develop entry resolves.
  registerDevelopPanel(cesdk, site.key);

  await cesdk.addPlugin(new BlurAssetSource());
  await cesdk.addPlugin(new ColorPaletteAssetSource());
  await cesdk.addPlugin(new CropPresetsAssetSource());
  await cesdk.addPlugin(new EffectsAssetSource());
  await cesdk.addPlugin(new FiltersAssetSource());
  await cesdk.addPlugin(new PagePresetsAssetSource());
  await cesdk.addPlugin(new StickerAssetSource());
  await cesdk.addPlugin(new TextAssetSource());
  await cesdk.addPlugin(new TextComponentAssetSource());
  await cesdk.addPlugin(new TypefaceAssetSource());
  await cesdk.addPlugin(new VectorShapeAssetSource());

  cesdk.i18n.setTranslations({
    en: {
      'actions.export.image': 'Export Image',
      'actions.save.image': 'Save',
    },
  });

  if (options.onSave) {
    const onSave = options.onSave;
    cesdk.ui.insertOrderComponent(
      { in: 'ly.img.navigation.bar', position: 'end' },
      {
        id: 'ly.img.action.navigationBar',
        key: 'actions.save.image',
        color: 'accent',
        icon: '@imgly/Save',
        label: 'actions.save.image',
        onClick: async () => {
          const { blobs } = await cesdk.utils.export({ mimeType: 'image/png' });
          await onSave(blobs[0]);
        },
      }
    );
  }

  cesdk.ui.insertOrderComponent(
    { in: 'ly.img.navigation.bar', position: 'end' },
    {
      id: 'ly.img.action.navigationBar',
      key: 'actions.export.image',
      icon: '@imgly/Image',
      label: 'actions.export.image',
      onClick: async () => {
        await cesdk.actions.run('exportDesign', { mimeType: 'image/png' });
      },
    }
  );
}
