const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ops = JSON.parse(fs.readFileSync('C:\\Users\\MASTER PC\\Downloads\\restrosuite\\.gemini\\antigravity\\scratch\\file_operations.json', 'utf8'));

// Sort operations by step index ASC
ops.sort((a, b) => a.idx - b.idx);

const workspaceRoot = 'c:\\Users\\MASTER PC\\Downloads\\restrosuite';

function normalizeNewlines(str) {
    if (!str) return '';
    return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function reconstruct(fileRelPath) {
    const fullPath = path.join(workspaceRoot, fileRelPath);
    console.log(`\n==========================================`);
    console.log(`Reconstructing: ${fileRelPath}`);
    console.log(`==========================================`);
    
    // Get clean baseline content from git
    let content = '';
    try {
        content = execSync(`git show HEAD:"${fileRelPath.replace(/\\/g, '/')}"`, {
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024
        });
    } catch (e) {
        console.error(`Failed to get git baseline for ${fileRelPath}, reading from disk instead...`);
        if (fs.existsSync(fullPath)) {
            content = fs.readFileSync(fullPath, 'utf8');
        } else {
            console.error(`File does not exist: ${fullPath}`);
            return;
        }
    }

    // Filter operations targeting this file
    const fileOps = ops.filter(op => {
        const target = op.args.TargetFile || op.args.TargetFile;
        if (!target) return false;
        const normTarget = target.toLowerCase().replace(/\\/g, '/');
        const normRel = fileRelPath.toLowerCase().replace(/\\/g, '/');
        return normTarget.endsWith(normRel);
    });

    // Deduplicate consecutive identical operations
    const fileOpsFiltered = [];
    for (let i = 0; i < fileOps.length; i++) {
        const current = fileOps[i];
        if (fileOpsFiltered.length > 0) {
            const prev = fileOpsFiltered[fileOpsFiltered.length - 1];
            if (current.type === prev.type && 
                JSON.stringify(current.args) === JSON.stringify(prev.args)) {
                // Skip identical step
                continue;
            }
        }
        fileOpsFiltered.push(current);
    }

    console.log(`Found ${fileOps.length} operations, filtered down to ${fileOpsFiltered.length} unique operations.`);

    let successCount = 0;
    let failCount = 0;

    for (const op of fileOpsFiltered) {
        const applyReplace = (target, replacement) => {
            if (!target) return;
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                successCount++;
            } else {
                // Try normalizing line endings (CRLF vs LF)
                const normContent = normalizeNewlines(content);
                const normTarget = normalizeNewlines(target);
                const normReplacement = normalizeNewlines(replacement);
                
                if (normContent.includes(normTarget)) {
                    content = normContent.replace(normTarget, normReplacement);
                    successCount++;
                } else {
                    console.warn(`[WARN] Step ${op.idx}: TargetContent not found! Target preview: ${JSON.stringify(target.substring(0, 80))}`);
                    failCount++;
                }
            }
        };

        if (op.args.ReplacementChunks) {
            // multi_replace_file_content
            for (const chunk of op.args.ReplacementChunks) {
                applyReplace(chunk.TargetContent, chunk.ReplacementContent);
            }
        } else if (op.args.TargetContent) {
            // single replace_file_content
            applyReplace(op.args.TargetContent, op.args.ReplacementContent);
        } else if (op.type === 'write_to_file') {
            if (op.args.CodeContent) {
                content = op.args.CodeContent;
                successCount++;
            }
        }
    }

    console.log(`Result: ${successCount} successful replacements, ${failCount} failed.`);
    
    // Write back to workspace
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Saved reconstructed file to: ${fullPath}`);
}

// Reconstruct files
reconstruct('dashboard.html');
reconstruct('assets\\features-pos.js');
reconstruct('assets\\dashboard.js');
reconstruct('assets\\db.js');
reconstruct('assets\\dashboard.css');
