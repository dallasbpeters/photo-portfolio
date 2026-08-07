import type CreativeEditorSDK from '@cesdk/cesdk-js';
import { developDockEntry } from '../../develop/panel';

export function setupDock(cesdk: CreativeEditorSDK): void {
  const { engine, ui } = cesdk;

  engine.editor.setSetting('dock/hideLabels', false);
  engine.editor.setSetting('dock/iconSize', 'large');

  ui.setComponentOrder({ in: 'ly.img.dock' }, [
    'ly.img.spacer',
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.crop',
      icon: '@imgly/Crop',
      label: 'Crop',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/crop'),
      onClick: () => {
        const page = engine.scene.getCurrentPage();
        if (page == null) return;
        if (engine.editor.getEditMode() === 'Crop') {
          engine.editor.setEditMode('Transform');
        } else {
          ui.closePanel('*');
          engine.block.select(page);
          engine.editor.setEditMode('Crop');
        }
      },
    },
    // Replaces the stock Adjust panel: same underlying effect, but the full
    // photo-grade control set plus compare and looks (see develop/panel.ts).
    developDockEntry(cesdk),
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.filter',
      icon: '@imgly/Filter',
      label: 'Filter',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/filters'),
      onClick: () => {
        const panelId = '//ly.img.panel/inspector/filters';
        if (ui.isPanelOpen(panelId)) { ui.closePanel(panelId); return; }
        const page = engine.scene.getCurrentPage();
        if (page == null) return;
        ui.closePanel('*');
        engine.editor.setEditMode('Transform');
        engine.block.select(page);
        ui.openPanel(panelId, { floating: true });
      },
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.effects',
      icon: '@imgly/Effects',
      label: 'Effects',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/effects'),
      onClick: () => {
        const panelId = '//ly.img.panel/inspector/effects';
        if (ui.isPanelOpen(panelId)) { ui.closePanel(panelId); return; }
        const page = engine.scene.getCurrentPage();
        if (page == null) return;
        ui.closePanel('*');
        engine.editor.setEditMode('Transform');
        engine.block.select(page);
        ui.openPanel(panelId, { floating: true });
      },
    },
    { id: 'ly.img.separator', key: 'ly.img.separator' },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.text',
      icon: '@imgly/Text',
      label: 'libraries.ly.img.text.label',
      isSelected: () => ui.isPanelOpen('//ly.img.panel/assetLibrary', {
        payload: { entries: ['ly.img.text'], title: 'libraries.ly.img.text.label' },
      }),
      onClick: () => {
        const isOpen = ui.isPanelOpen('//ly.img.panel/assetLibrary', {
          payload: { entries: ['ly.img.text'], title: 'libraries.ly.img.text.label' },
        });
        if (isOpen) { cesdk.ui.closePanel('//ly.img.panel/assetLibrary'); }
        else {
          cesdk.ui.closePanel('*');
          cesdk.ui.openPanel('//ly.img.panel/assetLibrary', {
            payload: { entries: ['ly.img.text'], title: 'libraries.ly.img.text.label' },
          });
        }
      },
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.sticker',
      icon: '@imgly/Sticker',
      label: 'libraries.ly.img.sticker.label',
      isSelected: () => ui.isPanelOpen('//ly.img.panel/assetLibrary', {
        payload: { entries: ['ly.img.sticker'], title: 'libraries.ly.img.sticker.label' },
      }),
      onClick: () => {
        const isOpen = ui.isPanelOpen('//ly.img.panel/assetLibrary', {
          payload: { entries: ['ly.img.sticker'], title: 'libraries.ly.img.sticker.label' },
        });
        if (isOpen) { cesdk.ui.closePanel('//ly.img.panel/assetLibrary'); }
        else {
          cesdk.ui.closePanel('*');
          cesdk.ui.openPanel('//ly.img.panel/assetLibrary', {
            payload: { entries: ['ly.img.sticker'], title: 'libraries.ly.img.sticker.label' },
          });
        }
      },
    },
    'ly.img.spacer',
  ]);
}
