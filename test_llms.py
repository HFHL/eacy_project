import sys
import asyncio
from pathlib import Path
import time
from openai import AsyncOpenAI

# 引入我们刚写的 router 以确保加载逻辑一致
root_dir = Path(__file__).parent.resolve()
sys.path.append(str(root_dir / "metadata-worker"))
from llm_router import get_llm_configs

async def test_model_connectivity(config):
    client = AsyncOpenAI(
        api_key=config.get('api_key'),
        base_url=config.get('base_url')
    )
    
    print(f"\n==========================================")
    print(f"🚀 测试节点: {config.get('id', 'Unknown')}")
    print(f"   接口地址: {config.get('base_url')}")
    print(f"   模型名称: {config.get('model')}")
    print(f"   权重级别: {config.get('priority', 'N/A')}")
    print(f"------------------------------------------")
    
    start_time = time.time()
    try:
        # 发送一段极短的测试文本，要求模型回复 OK，并设置 30s 强硬超时
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=config.get('model'),
                messages=[{"role": "user", "content": "请只回复两个大写字母：OK"}],
                max_tokens=10,
                temperature=0,
            ),
            timeout=30.0
        )
        elapsed = time.time() - start_time
        reply = response.choices[0].message.content.strip()
        
        print(f"✅ 测试成功! 耗时: {elapsed:.2f}秒")
        print(f"   模型回复: {reply}")
        
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"❌ 测试失败: 请求超时 (>{elapsed:.2f}s)！请检查网络连通性或当前提供商是否卡死。")
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ 测试失败: 发生异常 (耗时 {elapsed:.2f}s)")
        print(f"   错误信息: {e}")

async def main():
    try:
        # 按照 fallback 策略，它会把优先级高（数字小）的排在前面
        configs = get_llm_configs(strategy="fallback")
    except Exception as e:
        print(f"未能加载配置: {e}")
        return

    print(f"📦 成功加载 {len(configs)} 组 LLM 配置（按优先级排序），开始双向检查...")
    
    for config in configs:
        await test_model_connectivity(config)
        
    print(f"\n==========================================")
    print("🎉 连通性测试结束！")

if __name__ == "__main__":
    asyncio.run(main())
