import os
from typing import List, TypedDict
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from app.services.vector_store import retrieve_context
from app.core.config import settings

class GraphState(TypedDict):
    question: str
    generation: str
    documents: List[Document]
    steps: List[str]

# Using OpenAI for the LLM logic
# Ensure OPENAI_API_KEY is in the environment
llm = ChatOpenAI(temperature=0, model="gpt-4o-mini", api_key=settings.OPENAI_API_KEY)

# Data models for structured output
class GradeDocuments(BaseModel):
    """Binary score for relevance check on retrieved documents."""
    binary_score: str = Field(description="Documents are relevant to the question, 'yes' or 'no'")

class GradeHallucinations(BaseModel):
    """Binary score for hallucination present in generation answer."""
    binary_score: str = Field(description="Answer is grounded in the facts, 'yes' or 'no'")

class GradeAnswer(BaseModel):
    """Binary score to assess answer addresses question."""
    binary_score: str = Field(description="Answer addresses the question, 'yes' or 'no'")


def retrieve(state: GraphState):
    print("---RETRIEVE---")
    question = state["question"]
    documents = retrieve_context(question, top_k=5)
    steps = state.get("steps", [])
    steps.append("retrieve")
    return {"documents": documents, "question": question, "steps": steps}


def grade_documents(state: GraphState):
    print("---CHECK DOCUMENT RELEVANCE---")
    question = state["question"]
    documents = state["documents"]
    steps = state.get("steps", [])
    steps.append("grade_documents")

    structured_llm_grader = llm.with_structured_output(GradeDocuments)
    system = """You are a grader assessing relevance of a retrieved document to a user question. \n 
    If the document contains keyword(s) or semantic meaning related to the question, grade it as relevant. \n
    Give a binary score 'yes' or 'no' score to indicate whether the document is relevant to the question."""
    grade_prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human", "Retrieved document: \n\n {document} \n\n User question: {question}"),
    ])
    retrieval_grader = grade_prompt | structured_llm_grader

    filtered_docs = []
    for d in documents:
        score = retrieval_grader.invoke({"question": question, "document": d.page_content})
        grade = score.binary_score
        if grade == "yes":
            print("---GRADE: DOCUMENT RELEVANT---")
            filtered_docs.append(d)
        else:
            print("---GRADE: DOCUMENT NOT RELEVANT---")
            
    return {"documents": filtered_docs, "question": question, "steps": steps}


def generate(state: GraphState):
    print("---GENERATE---")
    question = state["question"]
    documents = state["documents"]
    steps = state.get("steps", [])
    steps.append("generate")

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Keep the answer concise. Cite your sources by appending [Page X] to the relevant sentences based on the context provided.\n\nContext:\n{context}"),
        ("human", "{question}")
    ])
    
    # Format documents with their page numbers
    context = ""
    for d in documents:
        page = d.metadata.get("page", "Unknown")
        context += f"[Page {page}]: {d.page_content}\n\n"

    rag_chain = prompt | llm
    generation = rag_chain.invoke({"context": context, "question": question})

    return {"documents": documents, "question": question, "generation": generation.content, "steps": steps}


def check_hallucinations(state: GraphState):
    print("---CHECK HALLUCINATIONS---")
    question = state["question"]
    documents = state["documents"]
    generation = state["generation"]
    
    structured_llm_grader = llm.with_structured_output(GradeHallucinations)
    system = """You are a grader assessing whether an LLM generation is grounded in / supported by a set of retrieved facts. \n 
    Give a binary score 'yes' or 'no'. 'Yes' means that the answer is grounded in / supported by the set of facts."""
    hallucination_prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human", "Set of facts: \n\n {documents} \n\n LLM generation: {generation}"),
    ])
    hallucination_grader = hallucination_prompt | structured_llm_grader

    context = "\n".join([d.page_content for d in documents])
    score = hallucination_grader.invoke({"documents": context, "generation": generation})
    grade = score.binary_score

    if grade == "yes":
        print("---DECISION: GENERATION IS GROUNDED IN DOCUMENTS---")
        # Ensure it answers the question
        structured_llm_grader_ans = llm.with_structured_output(GradeAnswer)
        system_ans = """You are a grader assessing whether an answer addresses / resolves a question. \n 
        Give a binary score 'yes' or 'no'. 'Yes' means that the answer resolves the question."""
        answer_prompt = ChatPromptTemplate.from_messages([
            ("system", system_ans),
            ("human", "User question: \n\n {question} \n\n LLM generation: {generation}"),
        ])
        answer_grader = answer_prompt | structured_llm_grader_ans
        ans_score = answer_grader.invoke({"question": question, "generation": generation})
        ans_grade = ans_score.binary_score
        
        if ans_grade == "yes":
            print("---DECISION: GENERATION ADDRESSES QUESTION---")
            return "useful"
        else:
            print("---DECISION: GENERATION DOES NOT ADDRESS QUESTION---")
            return "not useful"
    else:
        print("---DECISION: GENERATION IS NOT GROUNDED IN DOCUMENTS, RE-TRY---")
        return "not supported"


# Build the graph
workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve)
workflow.add_node("grade_documents", grade_documents)
workflow.add_node("generate", generate)

workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "grade_documents")
workflow.add_edge("grade_documents", "generate")

# Conditional edges after generate
workflow.add_conditional_edges(
    "generate",
    check_hallucinations,
    {
        "not supported": "generate",
        "useful": END,
        "not useful": "generate" # In a more complex graph we could rewrite the query here
    }
)

app_graph = workflow.compile()
