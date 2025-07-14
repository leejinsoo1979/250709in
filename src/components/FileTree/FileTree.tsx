import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Plus, MoreHorizontal, Edit2, Trash2, Copy, Settings, Palette, Home, Package } from 'lucide-react';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById } from '@/data/modules';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import styles from './FileTree.module.css';

interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: FileNode[];
  expanded?: boolean;
  parentId?: string;
  nodeType?: 'project' | 'space' | 'furniture' | 'material' | 'module' | 'config' | 'folder' | 'design';
  icon?: React.ReactNode;
}

interface FileTreeProps {
  onFileSelect?: (file: FileNode) => void;
  onCreateNew?: () => void;
}

const FileTree: React.FC<FileTreeProps> = ({ onFileSelect, onCreateNew }) => {
  const { basicInfo } = useProjectStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  
  const [files, setFiles] = useState<FileNode[]>([]);
  
  // 프로젝트 데이터를 파일트리 구조로 변환하는 함수 (간단한 구조)
  const generateProjectFileTree = (): FileNode[] => {
    // URL에서 프로젝트 정보를 가져오거나 기본값 사용
    const urlParams = new URLSearchParams(window.location.search);
    const projectFromUrl = urlParams.get('project');
    const projectName = basicInfo.title || projectFromUrl || '안방';
    
    // 간단한 폴더 구조: 프로젝트명 > 폴더 > 디자인이름
    return [
      {
        id: 'project-root',
        name: projectName,
        type: 'folder' as const,
        nodeType: 'project',
        icon: <Folder size={16} />,
        expanded: true,
        children: [
          {
            id: 'folder-1',
            name: '옷장',
            type: 'folder' as const,
            nodeType: 'folder',
            icon: <Folder size={16} />,
            expanded: true,
            children: [
              {
                id: 'design-1',
                name: '3단 선반 수납장',
                type: 'file' as const,
                nodeType: 'design',
                icon: <File size={16} />,
                parentId: 'folder-1'
              },
              {
                id: 'design-2',
                name: '서랍형 수납장',
                type: 'file' as const,
                nodeType: 'design',
                icon: <File size={16} />,
                parentId: 'folder-1'
              }
            ]
          }
        ]
      }
    ];
  };
  
  // 프로젝트 데이터가 변경될 때마다 파일트리 재생성
  useEffect(() => {
    setFiles(generateProjectFileTree());
  }, [basicInfo]);

  const [selectedFile, setSelectedFile] = useState<string | null>('2');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  const toggleExpanded = (nodeId: string) => {
    const updateNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setFiles(updateNode(files));
  };

  const handleFileClick = (node: FileNode) => {
    setSelectedFile(node.id);
    onFileSelect?.(node);
    
    // 노드 타입에 따라 적절한 액션 수행
    if (node.nodeType === 'design') {
      // 디자인 파일 클릭 시 에디터로 이동
      console.log('디자인 파일 선택:', node.name);
    } else if (node.nodeType === 'folder') {
      // 폴더 클릭 시 확장/축소
      console.log('폴더 선택:', node.name);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleContextAction = (action: string, nodeId: string) => {
    console.log(`Action: ${action} on node: ${nodeId}`);
    closeContextMenu();
    
    switch (action) {
      case 'rename':
        // 이름 변경 로직
        break;
      case 'delete':
        // 삭제 로직
        break;
      case 'copy':
        // 복사 로직
        break;
      case 'addFolder':
        // 새 폴더 추가 로직
        break;
    }
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile === node.id;

    return (
      <div key={node.id} className={styles.nodeWrapper}>
        <div
          className={`${styles.node} ${isSelected ? styles.selected : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleFileClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
        >
          <div className={styles.nodeContent}>
            {node.type === 'folder' && (
              <button
                className={styles.expandButton}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(node.id);
                }}
              >
                {hasChildren && node.expanded ? (
                  <ChevronDown size={12} />
                ) : hasChildren ? (
                  <ChevronRight size={12} />
                ) : null}
              </button>
            )}
            
            <div className={styles.icon}>
              {node.icon || (node.type === 'folder' ? (
                <Folder size={16} />
              ) : (
                <File size={16} />
              ))}
            </div>
            
            <span className={styles.name}>{node.name}</span>
          </div>
          
          <button
            className={styles.moreButton}
            onClick={(e) => handleContextMenu(e, node.id)}
          >
            <MoreHorizontal size={12} />
          </button>
        </div>
        
        {node.type === 'folder' && node.expanded && node.children && (
          <div className={styles.children}>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.fileTree} onClick={closeContextMenu}>
      <div className={styles.header}>
        <div className={styles.dropdown}>
          <select className={styles.select}>
            <option value="current">{basicInfo.title || '새 프로젝트'}</option>
          </select>
        </div>
        
        <button 
          className={styles.newButton}
          onClick={onCreateNew}
        >
          <Plus size={16} />
          신규 프로젝트 생성
        </button>
      </div>

      <div className={styles.treeContainer}>
        {files.map(node => renderNode(node))}
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => handleContextAction('addFolder', contextMenu.nodeId)}
          >
            <Plus size={14} />
            새로운 폴더
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleContextAction('rename', contextMenu.nodeId)}
          >
            <Edit2 size={14} />
            이름 수정
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleContextAction('copy', contextMenu.nodeId)}
          >
            <Copy size={14} />
            공유
          </button>
          <hr className={styles.contextMenuDivider} />
          <button
            className={styles.contextMenuItem}
            onClick={() => handleContextAction('delete', contextMenu.nodeId)}
          >
            <Trash2 size={14} />
            삭제하기
          </button>
        </div>
      )}
    </div>
  );
};

export default FileTree;