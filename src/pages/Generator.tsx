import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Box,
  Cat,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  Hammer,
  Image as ImageIcon,
  Pause,
  Play,
  Rabbit,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { cn } from '../lib/utils';
import { Generators } from '../lib/voxelGenerators';
import { VoxelEngine } from '../services/VoxelEngine';
import {
  AppState,
  BuildHistory,
  LegoPart,
  PersistedBuildRecord,
  SavedModel,
  VoxelData,
} from '../types';

const INITIAL_HISTORY: BuildHistory[] = [];

type PromptMode = 'create' | 'morph';
type JsonMode = 'import' | 'export' | null;
type GenerateMode = PromptMode | 'image';

function formatBuildMode(mode?: SavedModel['mode']) {
  switch (mode) {
    case 'image':
      return 'Image';
    case 'morph':
      return 'Rebuild';
    case 'import':
      return 'Import';
    case 'create':
    default:
      return 'Prompt';
  }
}

export default function Generator() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [voxelCount, setVoxelCount] = useState(0);
  const [appState, setAppState] = useState<AppState>(AppState.STABLE);
  const [currentBaseModel, setCurrentBaseModel] = useState('Eagle');
  const [currentModelData, setCurrentModelData] = useState<VoxelData[]>([]);
  const [customBuilds, setCustomBuilds] = useState<SavedModel[]>([]);
  const [customRebuilds, setCustomRebuilds] = useState<SavedModel[]>([]);
  const [history, setHistory] = useState<BuildHistory[]>(INITIAL_HISTORY);
  const [parts, setParts] = useState<LegoPart[]>([]);
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const [jsonMode, setJsonMode] = useState<JsonMode>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [promptMode, setPromptMode] = useState<PromptMode | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [isVoxelizing, setIsVoxelizing] = useState(false);
  const [isLoadingSavedBuilds, setIsLoadingSavedBuilds] = useState(true);
  const [databaseRecords, setDatabaseRecords] = useState<PersistedBuildRecord[]>([]);
  const [databasePath, setDatabasePath] = useState('');
  const [databaseOpen, setDatabaseOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

  const selectedRecord = useMemo(
    () => databaseRecords.find((record) => record.id === selectedRecordId) || databaseRecords[0] || null,
    [databaseRecords, selectedRecordId]
  );

  const loadSavedBuilds = useCallback(async () => {
    setIsLoadingSavedBuilds(true);

    try {
      const response = await fetch('/api/builds');
      if (!response.ok) {
        throw new Error('Failed to load saved builds');
      }

      const payload = await response.json();
      const records = Array.isArray(payload?.records) ? payload.records as PersistedBuildRecord[] : [];

      setDatabaseRecords(records);
      setDatabasePath(typeof payload?.databasePath === 'string' ? payload.databasePath : '');
      setSelectedRecordId((current) => current && records.some((record) => record.id === current) ? current : records[0]?.id ?? null);
      setCustomBuilds(
        records
          .filter((record) => record.mode === 'create' || record.mode === 'image' || record.mode === 'import')
          .map((record) => ({
            id: record.id,
            name: record.name,
            prompt: record.prompt,
            mode: record.mode,
            createdAt: record.createdAt,
            data: record.data,
          }))
      );
      setCustomRebuilds(
        records
          .filter((record) => record.mode === 'morph')
          .map((record) => ({
            id: record.id,
            name: record.name,
            prompt: record.prompt,
            mode: record.mode,
            createdAt: record.createdAt,
            baseModel: record.baseModel || undefined,
            data: record.data,
          }))
      );
      setHistory(
        records.map((record) => ({
          id: record.id,
          prompt: record.name,
          timestamp: record.createdAt,
        }))
      );
    } finally {
      setIsLoadingSavedBuilds(false);
    }
  }, []);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const engine = new VoxelEngine(viewerRef.current, setAppState, setVoxelCount);
    engineRef.current = engine;
    const initialModel = Generators.Eagle();
    engine.loadInitialModel(initialModel);
    setCurrentModelData(initialModel);
    syncPartsFromVoxels(initialModel);

    const handleResize = () => engine.handleResize();
    const resizeObserver = new ResizeObserver(() => engine.handleResize());
    window.addEventListener('resize', handleResize);
    resizeObserver.observe(viewerRef.current);
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      engine.cleanup();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSavedBuilds().catch((error) => {
      if (!cancelled) {
        console.error('Failed to load saved builds:', error);
        setIsLoadingSavedBuilds(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadSavedBuilds]);

  const relevantRebuilds = useMemo(
    () => customRebuilds.filter((item) => item.baseModel === currentBaseModel),
    [customRebuilds, currentBaseModel]
  );

  const modelLoaded = voxelCount > 0;
  const canBreak = appState === AppState.STABLE && modelLoaded;
  const canRebuild = appState === AppState.DISMANTLING && !isGenerating;

  function syncPartsFromVoxels(data: VoxelData[]) {
    const counts = new Map<number, number>();
    data.forEach((voxel) => {
      counts.set(voxel.color, (counts.get(voxel.color) || 0) + 1);
    });
    const generatedParts: LegoPart[] = Array.from(counts.entries()).map(([color, count], index) => ({
      id: `${color}-${index}`,
      name: '1x1 Brick',
      code: `Voxel #${index + 1}`,
      color: `#${color.toString(16).padStart(6, '0')}`,
      count,
    }));
    setParts(generatedParts);
  }

  function loadModel(name: string, data: VoxelData[]) {
    engineRef.current?.loadInitialModel(data);
    setCurrentBaseModel(name);
    setCurrentModelData(data);
    syncPartsFromVoxels(data);
    setHistory((prev) => [{ id: `${Date.now()}`, prompt: name, timestamp: Date.now() }, ...prev.slice(0, 19)]);
  }

  function rebuildModel(name: string, data: VoxelData[]) {
    engineRef.current?.rebuild(data);
    engineRef.current?.focusModel(data);
    setCurrentModelData(data);
    syncPartsFromVoxels(data);
    setHistory((prev) => [{ id: `${Date.now()}`, prompt: `${currentBaseModel} -> ${name}`, timestamp: Date.now() }, ...prev.slice(0, 19)]);
  }

  async function persistBuild(build: {
    name: string;
    prompt?: string;
    mode: 'create' | 'morph' | 'image' | 'import';
    baseModel?: string | null;
    data: VoxelData[];
  }) {
    try {
      const response = await fetch('/api/builds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(build),
      });

      if (!response.ok) {
        throw new Error('Failed to save build');
      }

      const payload = await response.json();
      const record = payload?.record as PersistedBuildRecord | undefined;
      if (!record) {
        return;
      }

      const savedModel: SavedModel = {
        id: record.id,
        name: record.name,
        prompt: record.prompt,
        mode: record.mode,
        createdAt: record.createdAt,
        baseModel: record.baseModel || undefined,
        data: record.data,
      };

      if (record.mode === 'morph') {
        setCustomRebuilds((prev) => [savedModel, ...prev.filter((item) => item.id !== record.id)]);
      } else {
        setCustomBuilds((prev) => [savedModel, ...prev.filter((item) => item.id !== record.id)]);
      }
      setDatabaseRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
      setSelectedRecordId(record.id);
    } catch (error) {
      console.error('Failed to persist build:', error);
    }
  }

  function handlePresetBuild(name: 'Eagle') {
    loadModel(name, Generators[name]());
  }

  function handlePresetRebuild(name: 'Cat' | 'Rabbit' | 'Twins') {
    rebuildModel(name, Generators[name]());
  }

  function handleToggleRotation() {
    const next = !isAutoRotate;
    setIsAutoRotate(next);
    engineRef.current?.setAutoRotate(next);
  }

  function handleLoadSavedBuild(build: SavedModel) {
    loadModel(build.name, build.data);
  }

  async function handleDeleteRecord(id: string) {
    setIsDeletingRecord(true);
    try {
      const response = await fetch(`/api/builds?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete build');
      }

      await loadSavedBuilds();
    } catch (error) {
      console.error('Failed to delete build:', error);
      window.alert('Delete failed.');
    } finally {
      setIsDeletingRecord(false);
    }
  }

  async function handleGenerate(mode: GenerateMode) {
    if (mode === 'image' && !referenceImage) {
      return;
    }
    if (mode !== 'image' && !prompt.trim()) {
      return;
    }

    setIsGenerating(true);
    if (mode === 'image') {
      setIsVoxelizing(true);
    } else {
      setPromptMode(mode);
    }

    try {
      const paletteHint =
        mode === 'morph' && engineRef.current
          ? `Try to stay close to these existing colors: ${engineRef.current.getUniqueColors().join(', ')}.`
          : 'Choose colors that make the build readable and playful.';

      let voxelData: VoxelData[] = [];

      try {
        const response = await fetch('/api/generate-voxel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode,
            prompt,
            paletteHint,
            referenceImage: referenceImage
              ? {
                  base64: referenceImage.base64,
                  mimeType: referenceImage.mimeType,
                }
              : null,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to generate voxel model');
        }

        const payload = await response.json();
        voxelData = Array.isArray(payload?.voxels) ? payload.voxels : [];
      } catch (serverError) {
        // AI Studio local runtime can work without a Vercel /api route.
        if (!process.env.GEMINI_API_KEY) {
          throw serverError;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const systemPrompt = mode === 'image'
          ? `You are a 3D Lego Voxel Artist. Analyze the attached image and convert it into a 3D Lego-style voxel model.
             Infer depth and volume to make it a true 3D sculpture, not just a flat plane.
             Return only a JSON array of voxels. Each voxel must have: x, y, z (integers) and color (hex string).
             Keep the total voxel count between 200 and 800 for performance.
             The model should be centered around (0, 0, 0).`
          : `Create a voxel Lego model for: ${prompt}. ${paletteHint}
             Return only a JSON array. Each item must include x, y, z, color where color is a hex string like #ff0000.
             Keep the model compact and suitable for a tabletop toy sculpture.`;

        const contents: any[] = [
          {
            role: 'user',
            parts: [{ text: systemPrompt }],
          },
        ];
        if (referenceImage) {
          contents[0].parts.push({
            inlineData: {
              data: referenceImage.base64,
              mimeType: referenceImage.mimeType,
            },
          });
        }

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  z: { type: Type.NUMBER },
                  color: { type: Type.STRING },
                },
                required: ['x', 'y', 'z', 'color'],
              },
            },
          },
        });

        const rawData = JSON.parse(response.text || '[]');
        voxelData = rawData.map((voxel: { x: number; y: number; z: number; color: string }) => {
          const value = voxel.color.startsWith('#') ? voxel.color.slice(1) : voxel.color;
          return {
            x: Math.round(Number(voxel.x)) || 0,
            y: Math.round(Number(voxel.y)) || 0,
            z: Math.round(Number(voxel.z)) || 0,
            color: Number.parseInt(value, 16) || 0xcccccc,
          };
        });
      }

      if (!voxelData.length) {
        throw new Error('Model generation returned an empty voxel list');
      }

      const buildName = mode === 'image' ? 'Photo Build' : (prompt || 'New Build');

      if (mode === 'create' || mode === 'image') {
        loadModel(buildName, voxelData);
      } else {
        rebuildModel(buildName, voxelData);
      }

      await persistBuild({
        name: buildName,
        prompt,
        mode,
        baseModel: mode === 'morph' ? currentBaseModel : null,
        data: voxelData,
      });

      if (mode !== 'image') {
        setPrompt('');
      }
      setReferenceImage(null);
    } catch (error) {
      console.error('Generation failed:', error);
      window.alert('Generation failed. On Vercel, please set server environment variable GEMINI_API_KEY.');
    } finally {
      setIsGenerating(false);
      setIsVoxelizing(false);
      setPromptMode(null);
    }
  }

  function openExportModal() {
    if (!engineRef.current) {
      return;
    }
    setJsonMode('export');
    setJsonText(engineRef.current.getJsonData());
    setJsonError('');
  }

  function openImportModal() {
    setJsonMode('import');
    setJsonText('');
    setJsonError('');
  }

  function handleJsonImport() {
    try {
      const rawData = JSON.parse(jsonText);
      if (!Array.isArray(rawData)) {
        throw new Error('JSON must be an array');
      }
      const voxelData: VoxelData[] = rawData.map((voxel: Record<string, unknown>) => {
        let colorValue = voxel.c ?? voxel.color;
        if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
          colorValue = colorValue.slice(1);
        }
        return {
          x: Number(voxel.x) || 0,
          y: Number(voxel.y) || 0,
          z: Number(voxel.z) || 0,
          color:
            typeof colorValue === 'number'
              ? colorValue
              : Number.parseInt(String(colorValue || 'cccccc'), 16) || 0xcccccc,
        };
      });
      loadModel('Imported Build', voxelData);
      void persistBuild({
        name: 'Imported Build',
        prompt: 'Imported from JSON blueprint',
        mode: 'import',
        baseModel: null,
        data: voxelData,
      });
      setJsonMode(null);
    } catch (error) {
      setJsonError('Invalid JSON format.');
    }
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(jsonText).catch((error) => console.error(error));
  }

  function handleExportParts() {
    if (!parts.length) {
      return;
    }
    const content =
      `Build: ${currentBaseModel}\n\nParts List:\n` +
      parts.map((part) => `- ${part.name} (${part.code}): x${part.count}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentBaseModel.replace(/\s+/g, '_')}_parts_list.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden relative">
      <motion.aside
        initial={false}
        animate={{ width: leftPanelCollapsed ? 0 : 320, opacity: leftPanelCollapsed ? 0 : 1 }}
        className={cn(
          'glass-panel flex flex-col min-h-0 border-r border-outline-variant/10 relative z-30 overflow-hidden',
          leftPanelCollapsed && 'border-none'
        )}
      >
        <div className="p-6 flex flex-col flex-1 min-h-0 gap-6 min-w-[320px] overflow-hidden">
          <div className="space-y-1">
            <h2 className="text-xs font-bold tracking-widest uppercase text-tertiary font-headline">Workbench</h2>
            <p className="text-xl font-bold font-headline leading-tight">Use the new UI to control your 3D Lego voxel builds</p>
          </div>

          <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/20 space-y-4">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="w-full h-28 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4 text-sm text-on-surface focus:ring-2 focus:ring-tertiary focus:border-transparent outline-none transition-all resize-none"
              placeholder="Describe a brick build, for example futuristic owl tower"
            />
            <button
              onClick={() => handleGenerate('create')}
              disabled={isGenerating}
              className="stud-button w-full py-4 bg-primary text-on-primary rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-primary/20 disabled:opacity-50 transition-all"
            >
              {isGenerating && promptMode === 'create' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Generate New Build
            </button>
            <button
              onClick={openImportModal}
              className="stud-button w-full py-3 bg-surface-container-high text-on-surface rounded-xl font-bold flex items-center justify-center gap-2 border border-outline-variant/20"
            >
              <Upload className="w-4 h-4" />
              Import JSON Blueprint
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Reference Image</h3>
              {referenceImage && (
                <button
                  onClick={() => setReferenceImage(null)}
                  className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="relative group">
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64 = (reader.result as string).split(',')[1];
                      setReferenceImage({
                        base64,
                        mimeType: file.type,
                        preview: reader.result as string,
                      });
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <div className="stud-button w-full aspect-video rounded-xl bg-surface-container-high border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center gap-2 group-hover:border-tertiary/50 transition-all overflow-hidden relative">
                {referenceImage ? (
                  <img
                    src={referenceImage.preview}
                    alt="Reference"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <>
                    <div className="p-3 rounded-full bg-surface-bright/50">
                      <ImageIcon className="w-6 h-6 text-tertiary" />
                    </div>
                    <span className="text-xs font-bold text-on-surface-variant">Upload Reference</span>
                  </>
                )}
              </div>
            </div>
            {referenceImage && (
              <button
                onClick={() => handleGenerate('image')}
                disabled={isGenerating}
                className="stud-button w-full py-3 bg-tertiary text-on-tertiary rounded-xl font-headline font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-tertiary/20"
              >
                {isVoxelizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Voxelize Image
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 overflow-hidden h-[240px] shrink-0">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Saved Builds</h3>
              <span className="text-[10px] text-on-surface-variant">{customBuilds.length} items</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 min-h-0">
              {isLoadingSavedBuilds ? (
                <div className="rounded-xl bg-surface-container-high px-4 py-3 border border-outline-variant/10 text-sm text-on-surface-variant">
                  Loading saved builds...
                </div>
              ) : customBuilds.length > 0 ? (
                customBuilds.map((item, index) => (
                  <button
                    key={item.id || `${item.name}-${index}`}
                    onClick={() => handleLoadSavedBuild(item)}
                    className="w-full rounded-xl bg-surface-container-high px-4 py-3 border border-outline-variant/10 text-left hover:bg-surface-bright transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-on-surface truncate">{item.name}</div>
                        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Saved build'}
                        </div>
                      </div>
                      <span className="rounded-md bg-surface-container-lowest px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-tertiary shrink-0">
                        {formatBuildMode(item.mode)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl bg-surface-container-high px-4 py-3 border border-outline-variant/10 text-sm text-on-surface-variant">
                  Your generated and imported builds will appear here.
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 overflow-hidden h-[220px] shrink-0 mt-auto">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">History</h3>
              <span className="text-[10px] text-on-surface-variant">{history.length} entries</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 min-h-0">
              {history.map((item) => (
                <div key={item.id} className="rounded-xl bg-surface-container-high px-4 py-3 border border-outline-variant/10 shrink-0">
                  <div className="text-sm font-bold text-on-surface">{item.prompt}</div>
                  <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </motion.aside>

      <button
        onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
        className={cn(
          'absolute z-40 w-8 h-8 bg-surface-container-high border border-outline-variant/20 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-all shadow-lg stud-button top-1/2 -translate-y-1/2',
          leftPanelCollapsed ? 'left-4' : 'left-[304px]'
        )}
      >
        {leftPanelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <main className="flex-1 min-w-0 min-h-0 relative flex flex-col bg-background overflow-hidden">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-4 p-1.5 bg-surface-container-high/75 backdrop-blur-xl rounded-full border border-outline-variant/20 shadow-[0_18px_40px_rgba(0,0,0,0.32)] z-20 px-6">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-tertiary" />
            <span className="text-sm font-bold text-on-surface truncate max-w-[120px]">{currentBaseModel}</span>
          </div>
          <div className="w-px h-5 bg-outline-variant/30"></div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (currentModelData.length) {
                  engineRef.current?.loadInitialModel(currentModelData);
                }
              }}
              className="p-2 hover:bg-surface-bright rounded-full text-on-surface-variant hover:text-tertiary transition-all"
              title="Reset View"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button 
              onClick={handleToggleRotation} 
              className="p-2 hover:bg-surface-bright rounded-full text-on-surface-variant hover:text-tertiary transition-all"
              title={isAutoRotate ? "Pause Rotation" : "Play Rotation"}
            >
              {isAutoRotate ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button 
              onClick={openExportModal} 
              className="p-2 hover:bg-surface-bright rounded-full text-on-surface-variant hover:text-tertiary transition-all"
              title="Export JSON"
            >
              <Code2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDatabaseOpen(true)}
              className="p-2 hover:bg-surface-bright rounded-full text-on-surface-variant hover:text-tertiary transition-all"
              title="Database Panel"
            >
              <Database className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-surface-container-high/68 backdrop-blur-xl px-4 py-2 border border-outline-variant/20 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Voxels</span>
          <span className="text-lg font-black text-secondary">{voxelCount}</span>
          <span className="text-xs font-bold uppercase tracking-widest text-tertiary">{appState}</span>
        </div>

        <div className="flex-1 flex items-center justify-center overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1d2f52_0%,#0b1326_48%,#07101d_100%)]"></div>
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #424752 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
          <div className="absolute inset-x-[8%] top-[12%] bottom-[12%] rounded-[40px] border border-white/6 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"></div>
          <div ref={viewerRef} className="absolute inset-0 z-10" />

          {!modelLoaded && !isGenerating && (
            <div className="relative z-20 flex flex-col items-center text-center max-w-sm px-6 pointer-events-none">
              <div className="mb-6 relative">
                <div className="absolute -inset-10 bg-tertiary/10 blur-[60px] rounded-full"></div>
                <div className="relative w-24 h-24 bg-surface-container-high/50 rounded-3xl border border-outline-variant/30 flex items-center justify-center shadow-inner">
                  <Box className="w-12 h-12 text-on-surface-variant/40" />
                </div>
              </div>
              <h3 className="text-xl font-bold font-headline text-on-surface mb-2">No Model Loaded</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">Load a preset, import JSON, or generate a new brick sculpture from the left panel.</p>
            </div>
          )}

          {isGenerating && (
            <div className="absolute z-20 flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-tertiary/20 border-t-tertiary rounded-full animate-spin"></div>
              <p className="text-tertiary font-bold animate-pulse">Assembling bricks...</p>
            </div>
          )}

          <div className="absolute bottom-6 left-6 flex items-center gap-4 text-on-surface-variant/40 z-20">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span className="text-[10px] font-label font-bold uppercase tracking-tighter">X-AXIS</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary-container"></span>
              <span className="text-[10px] font-label font-bold uppercase tracking-tighter">Y-AXIS</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              <span className="text-[10px] font-label font-bold uppercase tracking-tighter">Z-AXIS</span>
            </div>
          </div>

        </div>
      </main>

      <div className="pointer-events-none fixed left-1/2 bottom-6 z-50 flex -translate-x-1/2 justify-center px-6">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-[28px] border border-outline-variant/20 bg-surface-container-high/80 p-3 shadow-[0_24px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <button
            onClick={() => engineRef.current?.dismantle()}
            disabled={!canBreak}
            className="stud-button px-5 py-3 rounded-xl bg-primary text-on-primary font-headline font-bold flex items-center gap-2 disabled:opacity-50"
          >
            <Hammer className="w-4 h-4" />
            Break
          </button>
          <button
            onClick={() => rebuildModel(currentBaseModel, currentModelData)}
            disabled={!canRebuild}
            className="stud-button px-5 py-3 rounded-xl bg-secondary text-on-secondary font-headline font-bold flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Rebuild
          </button>
        </div>
      </div>

      <motion.aside
        initial={false}
        animate={{ width: rightPanelCollapsed ? 0 : 320, opacity: rightPanelCollapsed ? 0 : 1 }}
        className={cn(
          'glass-panel flex flex-col min-h-0 border-l border-outline-variant/10 relative z-30 overflow-hidden',
          rightPanelCollapsed && 'border-none'
        )}
      >
        <div className="p-6 flex flex-col flex-1 min-h-0 gap-6 min-w-[320px]">
          <div className="bg-surface-container/40 p-4 rounded-xl border border-outline-variant/20 flex items-center gap-3">
            <div className={cn('w-2 h-2 rounded-full shadow-[0_0_12px_rgba(171,199,255,0.4)]', modelLoaded ? 'bg-tertiary' : 'bg-outline-variant')}></div>
            <span className={cn('text-sm font-bold', modelLoaded ? 'text-tertiary' : 'text-on-surface-variant')}>
              {modelLoaded ? '3D build loaded' : 'Idle'}
            </span>
          </div>

          <div className="flex flex-col gap-4 overflow-hidden h-[320px] shrink-0">
            <div className="flex justify-between items-end shrink-0">
              <h3 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant">Parts Inventory</h3>
              <span className="text-[10px] font-bold text-on-surface-variant">TOTAL: {parts.reduce((sum, part) => sum + part.count, 0)}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 min-h-0">
              {parts.map((part) => (
                <div key={part.id} className="flex items-center gap-4 p-3 bg-surface-container-high rounded-xl hover:bg-surface-bright transition-all group shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center border border-outline-variant/10">
                    <div className="w-6 h-4 rounded-[2px] relative" style={{ backgroundColor: part.color }}>
                      <div className="absolute -top-1 left-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: part.color }}></div>
                      <div className="absolute -top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: part.color }}></div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-on-surface">{part.name}</p>
                    <p className="text-[10px] text-on-surface-variant">{part.code}</p>
                  </div>
                  <span className="font-bold text-sm text-primary">x{part.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 shrink-0 bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10">
            <div className="flex items-center gap-2">
              <Hammer className="w-3 h-3 text-primary" />
              <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Quick Rebuilds</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handlePresetRebuild('Cat')}
                disabled={!canRebuild}
                className="stud-button py-3 rounded-xl bg-surface-container-high text-on-surface font-headline font-bold disabled:opacity-50 border border-outline-variant/10 hover:bg-surface-bright transition-all flex items-center justify-center gap-2 group"
              >
                <Cat className="w-4 h-4 text-secondary group-hover:scale-110 transition-transform" />
                Cat
              </button>
              <button
                onClick={() => handlePresetRebuild('Rabbit')}
                disabled={!canRebuild}
                className="stud-button py-3 rounded-xl bg-surface-container-high text-on-surface font-headline font-bold disabled:opacity-50 flex items-center justify-center gap-2 border border-outline-variant/10 hover:bg-surface-bright transition-all group"
              >
                <Rabbit className="w-4 h-4 text-tertiary group-hover:scale-110 transition-transform" />
                Rabbit
              </button>
            </div>
          </div>

          {relevantRebuilds.length > 0 && (
            <div className="space-y-2 flex-1 min-h-0 flex flex-col overflow-hidden">
              <h3 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant shrink-0">Saved Rebuilds</h3>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 min-h-0">
                {relevantRebuilds.map((item, index) => (
                  <button
                    key={`${item.name}-${index}`}
                    onClick={() => rebuildModel(item.name, item.data)}
                    disabled={!canRebuild}
                    className="w-full rounded-xl bg-surface-container-high px-4 py-3 text-left border border-outline-variant/20 disabled:opacity-50 shrink-0"
                  >
                    <div className="text-sm font-bold text-on-surface">{item.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">Saved AI Rebuild</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-auto shrink-0">
            <button
              onClick={handleExportParts}
              disabled={!modelLoaded}
              className="stud-button w-full py-4 bg-tertiary text-on-tertiary rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              Download Parts List
            </button>
            <button
              onClick={handleCopyJson}
              disabled={!jsonText}
              className="stud-button w-full py-3 bg-surface-variant text-on-surface-variant rounded-xl border border-outline-variant/20 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Copy className="w-4 h-4" />
              Copy JSON Data
            </button>
          </div>
        </div>
      </motion.aside>

      <button
        onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        className={cn(
          'absolute z-40 w-8 h-8 bg-surface-container-high border border-outline-variant/20 rounded-full flex items-center justify-center text-on-surface-variant hover:text-tertiary transition-all shadow-lg stud-button top-1/2 -translate-y-1/2',
          rightPanelCollapsed ? 'right-4' : 'right-[304px]'
        )}
      >
        {rightPanelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {jsonMode && (
        <div className="absolute inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-3xl rounded-3xl bg-surface-container-high border border-outline-variant/20 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
              <div>
                <h3 className="text-lg font-bold text-on-surface">{jsonMode === 'import' ? 'Import JSON Blueprint' : 'Export JSON Blueprint'}</h3>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Voxel Lego Data</p>
              </div>
              <button onClick={() => setJsonMode(null)} className="p-2 rounded-xl hover:bg-surface-bright text-on-surface-variant">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                readOnly={jsonMode === 'export'}
                className="w-full h-[360px] rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 font-mono text-xs text-on-surface resize-none outline-none"
              />
              {jsonError && <div className="text-sm text-primary font-bold">{jsonError}</div>}
              <div className="flex justify-end gap-3">
                {jsonMode === 'export' ? (
                  <button onClick={handleCopyJson} className="stud-button px-5 py-3 rounded-xl bg-primary text-on-primary font-bold flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                ) : (
                  <button onClick={handleJsonImport} className="stud-button px-5 py-3 rounded-xl bg-secondary-container text-on-secondary-container font-bold flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Import
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {databaseOpen && (
        <div className="absolute inset-0 z-[75] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-6xl h-[80vh] rounded-3xl bg-surface-container-high border border-outline-variant/20 shadow-2xl overflow-hidden flex">
            <div className="w-[360px] border-r border-outline-variant/10 bg-surface-container/70 flex flex-col min-h-0">
              <div className="px-6 py-5 border-b border-outline-variant/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">Database Panel</h3>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">Saved Builds</p>
                  </div>
                  <button
                    onClick={() => setDatabaseOpen(false)}
                    className="p-2 rounded-xl hover:bg-surface-bright text-on-surface-variant"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="rounded-xl bg-surface-container-lowest/70 border border-outline-variant/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Database File</div>
                  <div className="text-xs text-on-surface break-all">{databasePath || 'Loading...'}</div>
                </div>
                <button
                  onClick={() => loadSavedBuilds().catch((error) => console.error(error))}
                  className="stud-button w-full py-3 bg-surface-container-high text-on-surface rounded-xl font-bold flex items-center justify-center gap-2 border border-outline-variant/20"
                >
                  <RefreshCw className={cn('w-4 h-4', isLoadingSavedBuilds && 'animate-spin')} />
                  Refresh Records
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 min-h-0">
                {databaseRecords.length > 0 ? (
                  databaseRecords.map((record) => (
                    <button
                      key={record.id}
                      onClick={() => setSelectedRecordId(record.id)}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3 text-left transition-all',
                        selectedRecord?.id === record.id
                          ? 'bg-tertiary/12 border-tertiary/40'
                          : 'bg-surface-container-high border-outline-variant/10 hover:bg-surface-bright'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-on-surface truncate">{record.name}</div>
                          <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                            {new Date(record.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="rounded-md bg-surface-container-lowest px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-tertiary shrink-0">
                          {formatBuildMode(record.mode)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-on-surface-variant">{record.voxelCount} voxels</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl bg-surface-container-high px-4 py-3 border border-outline-variant/10 text-sm text-on-surface-variant">
                    No records in the database yet.
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Selected Record</div>
                  <div className="text-xl font-bold text-on-surface">{selectedRecord?.name || 'No record selected'}</div>
                </div>
                {selectedRecord && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleLoadSavedBuild({
                        id: selectedRecord.id,
                        name: selectedRecord.name,
                        prompt: selectedRecord.prompt,
                        mode: selectedRecord.mode,
                        createdAt: selectedRecord.createdAt,
                        baseModel: selectedRecord.baseModel || undefined,
                        data: selectedRecord.data,
                      })}
                      className="stud-button px-4 py-3 rounded-xl bg-primary text-on-primary font-bold"
                    >
                      Load Build
                    </button>
                    <button
                      onClick={() => handleDeleteRecord(selectedRecord.id)}
                      disabled={isDeletingRecord}
                      className="stud-button px-4 py-3 rounded-xl bg-surface-container-low text-primary font-bold border border-outline-variant/20 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {selectedRecord ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                        <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Mode</div>
                        <div className="text-sm font-bold text-on-surface">{formatBuildMode(selectedRecord.mode)}</div>
                      </div>
                      <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                        <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Voxel Count</div>
                        <div className="text-sm font-bold text-on-surface">{selectedRecord.voxelCount}</div>
                      </div>
                      <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                        <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Base Model</div>
                        <div className="text-sm font-bold text-on-surface">{selectedRecord.baseModel || 'None'}</div>
                      </div>
                      <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                        <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Created At</div>
                        <div className="text-sm font-bold text-on-surface">{new Date(selectedRecord.createdAt).toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-surface-container-low p-5 border border-outline-variant/10">
                      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Prompt</div>
                      <div className="text-sm text-on-surface whitespace-pre-wrap break-words">
                        {selectedRecord.prompt || 'No prompt stored for this record.'}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-surface-container-low p-5 border border-outline-variant/10">
                      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Voxel JSON Preview</div>
                      <textarea
                        readOnly
                        value={JSON.stringify(selectedRecord.data.slice(0, 80), null, 2)}
                        className="w-full h-[280px] rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 font-mono text-xs text-on-surface resize-none outline-none"
                      />
                      <div className="mt-2 text-xs text-on-surface-variant">
                        Showing the first {Math.min(selectedRecord.data.length, 80)} voxels from this record.
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl bg-surface-container-low p-5 border border-outline-variant/10 text-on-surface-variant">
                    Pick a record from the left to inspect what is stored in the database.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
