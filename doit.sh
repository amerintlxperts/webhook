#!/bin/bash
#

helm package ./charts/ -d docs/
helm repo index docs/ --url https://amerintlxperts.github.io/webhook/
git checkout gh-pages
git add docs/
git commit -m "Add or update Helm chart"
git push origin gh-pages
