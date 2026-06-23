import { useEffect, useReducer } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
} from 'lucide-react';
import { markdownToHtml, htmlToMarkdown } from '@/lib/markdownBridge';
import { cn } from '@/lib/utils';

interface PreparationDocEditorProps {
  initialMarkdown: string;
  onChange: (getMarkdown: () => string) => void;
}

interface ToolButton {
  icon: typeof Bold;
  title: string;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const TOOLS: ToolButton[] = [
  { icon: Bold, title: 'Bold', isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { icon: Italic, title: 'Italic', isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { icon: UnderlineIcon, title: 'Underline', isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { icon: Heading2, title: 'Heading', isActive: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { icon: Heading3, title: 'Subheading', isActive: (e) => e.isActive('heading', { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { icon: List, title: 'Bullet list', isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { icon: ListOrdered, title: 'Numbered list', isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
];

export function PreparationDocEditor({ initialMarkdown, onChange }: PreparationDocEditorProps) {
  const [, forceRender] = useReducer((x) => x + 1, 0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: markdownToHtml(initialMarkdown),
  });

  useEffect(() => {
    if (!editor) return;
    onChange(() => htmlToMarkdown(editor.getHTML()));
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor, onChange]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {TOOLS.map(({ icon: Icon, title, isActive, run }) => (
          <button
            key={title}
            type="button"
            title={title}
            onClick={() => run(editor)}
            className={cn(
              'p-1.5 rounded text-slate-600 hover:bg-slate-200 transition-colors',
              isActive(editor) && 'bg-[#534AB7] text-white hover:bg-[#534AB7]',
            )}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-slate max-w-none p-4 min-h-[300px] max-h-[60vh] overflow-y-auto scrollbar-thin
          prose-headings:text-slate-900 prose-h2:text-lg prose-h3:text-base prose-p:text-sm prose-li:text-sm
          prose-strong:text-slate-900 prose-a:text-[#5067F4]
          [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_th]:text-sm
          [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_td]:text-sm [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
