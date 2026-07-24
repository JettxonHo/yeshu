#!/usr/bin/env bash
# ============================================================
# 野薯 V2-a · 一次性 GitHub Projects V2 字段配置
# ------------------------------------------------------------
# 1) 扩展内建 Status 到 spec 6 态(改名现有 option + 补齐)
#    Todo→Backlog / In Progress→Doing / Done 保留 / 新增 Next/Paused/Abandoned
#    注意:updateProjectV2Field 会用新 option 数组整体替换,
#    故必须带上 3 个现有 option 的 id,否则会清空 item 的 Status 值。
# 2) 新建 Priority(P0-P3)/ Type(Idea/Feature/Bug/Learn/Show)/ Effort(S/M/L/XL)
#
# 用法:从仓库根 `bash scripts/setup-v2a-fields.sh`(读 .env 的 GITHUB_TOKEN)
# 幂等性:createProjectV2Field 重复跑会建重名字段——只跑一次。
# ============================================================
set -euo pipefail

set -a; source "$(dirname "$0")/../.env"; set +a

PROJECT_ID="PVT_kwHODSJQBM4Bd1Sw"
STATUS_FIELD_ID="PVTSSF_lAHODSJQBM4Bd1SwzhYT7-w"
GQL="https://api.github.com/graphql"

gql() { curl -sS -H "Authorization: bearer $GITHUB_TOKEN" -X POST "$GQL" -d "$(jq -nc --arg q "$1" '{query:$q}')"; }

echo "=== 1/4 扩展 Status → 6 态 ==="
gql 'mutation{updateProjectV2Field(input:{fieldId:"'"$STATUS_FIELD_ID"'",name:"Status",singleSelectOptions:[{id:"f75ad846",name:"Backlog",description:"",color:GRAY},{id:"47fc9ee4",name:"Doing",description:"",color:ORANGE},{id:"98236657",name:"Done",description:"",color:GREEN},{name:"Next",description:"",color:BLUE},{name:"Paused",description:"",color:PURPLE},{name:"Abandoned",description:"",color:RED}]}){projectV2Field{...on ProjectV2SingleSelectField{name options{id name}}}}}' | jq '.data.updateProjectV2Field.projectV2Field // .'

echo "=== 2/4 新建 Priority ==="
gql 'mutation{createProjectV2Field(input:{projectId:"'"$PROJECT_ID"'",name:"Priority",dataType:SINGLE_SELECT,singleSelectOptions:[{name:"P0",description:"",color:RED},{name:"P1",description:"",color:ORANGE},{name:"P2",description:"",color:YELLOW},{name:"P3",description:"",color:GRAY}]}){projectV2Field{...on ProjectV2SingleSelectField{name options{id name}}}}}' | jq '.data.createProjectV2Field.projectV2Field // .'

echo "=== 3/4 新建 Type ==="
gql 'mutation{createProjectV2Field(input:{projectId:"'"$PROJECT_ID"'",name:"Type",dataType:SINGLE_SELECT,singleSelectOptions:[{name:"Idea",description:"",color:PURPLE},{name:"Feature",description:"",color:BLUE},{name:"Bug",description:"",color:RED},{name:"Learn",description:"",color:GREEN},{name:"Show",description:"",color:YELLOW}]}){projectV2Field{...on ProjectV2SingleSelectField{name options{id name}}}}}' | jq '.data.createProjectV2Field.projectV2Field // .'

echo "=== 4/4 新建 Effort ==="
gql 'mutation{createProjectV2Field(input:{projectId:"'"$PROJECT_ID"'",name:"Effort",dataType:SINGLE_SELECT,singleSelectOptions:[{name:"S",description:"",color:GREEN},{name:"M",description:"",color:BLUE},{name:"L",description:"",color:ORANGE},{name:"XL",description:"",color:RED}]}){projectV2Field{...on ProjectV2SingleSelectField{name options{id name}}}}}' | jq '.data.createProjectV2Field.projectV2Field // .'

echo "=== 验证:重新查询字段 ==="
gql 'query{user(login:"JettxonHo"){projectV2(number:1){fields(first:30){nodes{...on ProjectV2SingleSelectField{name options{id name}}}}}}}' | jq '[.data.user.projectV2.fields.nodes[] | select(.name)]'
