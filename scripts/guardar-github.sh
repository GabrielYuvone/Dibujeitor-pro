#!/bin/bash
cd /home/z/my-project
git add -A
git commit -m "cambios del $(date '+%d/%m/%Y %H:%M')"
git push origin main
echo "CAMBIOS GUARDADOS EN GITHUB"
